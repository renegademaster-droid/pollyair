const express = require('express');
const cors = require('cors');
const webpush = require('web-push');
const cron = require('node-cron');
const { NetCDFReader } = require('netcdfjs');
const { PNG } = require('pngjs');

const app = express();
app.use(express.json());
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));

// VAPID setup
webpush.setVapidDetails(
  `mailto:${process.env.VAPID_EMAIL || 'admin@pollyair.app'}`,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// In-memory subscription store
// Structure: { id, subscription, lat, lng, threshold, prevAQ, lastNotified }
const subscriptions = new Map();

// Finnish AQ index thresholds (µg/m³)
const AQ_BREAKS = {
  no2:  [0, 40,  70,  150, 200, 300],
  o3:   [0, 60,  80,  120, 160, 240],
  pm10: [0, 20,  40,   50,  75, 100],
  pm25: [0, 10,  15,   25,  40,  75],
};

function pollutantSubIndex(param, value) {
  const breaks = AQ_BREAKS[param];
  if (!breaks || value == null) return 1;
  for (let i = breaks.length - 1; i >= 0; i--) {
    if (value > breaks[i]) return i + 1;
  }
  return 1;
}

async function fetchAQIndex(lat, lng) {
  const url = new URL('https://air-quality-api.open-meteo.com/v1/air-quality');
  url.searchParams.set('latitude', lat);
  url.searchParams.set('longitude', lng);
  url.searchParams.set('current', 'no2,ozone,pm10,pm2_5');
  url.searchParams.set('timezone', 'auto');

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  const data = await res.json();
  const c = data.current ?? {};

  const indices = [
    pollutantSubIndex('no2',  c.no2),
    pollutantSubIndex('o3',   c.ozone),
    pollutantSubIndex('pm10', c.pm10),
    pollutantSubIndex('pm25', c.pm2_5),
  ];
  return Math.max(...indices);
}

const AQ_LABELS = ['', 'Hyvä', 'Tyydyttävä', 'Välttävä', 'Huono', 'Erittäin huono', 'Vaarallinen'];

async function checkAndNotify() {
  if (subscriptions.size === 0) return;
  console.log(`[cron] Tarkistetaan ${subscriptions.size} tilauksen ilmanlaatu...`);

  // Group by location to avoid redundant API calls
  const locationMap = new Map();
  for (const [id, sub] of subscriptions) {
    const key = `${sub.lat.toFixed(3)},${sub.lng.toFixed(3)}`;
    if (!locationMap.has(key)) locationMap.set(key, []);
    locationMap.get(key).push(id);
  }

  for (const [locKey, ids] of locationMap) {
    const [lat, lng] = locKey.split(',').map(Number);
    let aqIndex;
    try {
      aqIndex = await fetchAQIndex(lat, lng);
    } catch (e) {
      console.warn(`[cron] AQ-haku epäonnistui (${locKey}):`, e.message);
      continue;
    }

    for (const id of ids) {
      const sub = subscriptions.get(id);
      if (!sub) continue;

      const crossedThreshold = sub.prevAQ !== null
        && sub.prevAQ < sub.threshold
        && aqIndex >= sub.threshold;

      if (crossedThreshold) {
        const payload = JSON.stringify({
          title: 'PollyAir — Ilmanlaatu heikentynyt',
          body: `Ilmanlaatu on nyt ${AQ_LABELS[aqIndex]} (${aqIndex}/6) sijaintisi lähellä.`,
          aqIndex,
        });
        try {
          await webpush.sendNotification(sub.subscription, payload);
          sub.lastNotified = Date.now();
          console.log(`[cron] Notifikaatio lähetetty: id=${id} aq=${aqIndex}`);
        } catch (e) {
          console.warn(`[cron] Lähetys epäonnistui id=${id}:`, e.message);
          if (e.statusCode === 410 || e.statusCode === 404) {
            subscriptions.delete(id);
          }
        }
      }

      sub.prevAQ = aqIndex;
    }
  }
}

// Check every 30 minutes
cron.schedule('*/30 * * * *', checkAndNotify);

// --- API endpoints ---

app.get('/vapid-public-key', (req, res) => {
  res.json({ key: process.env.VAPID_PUBLIC_KEY });
});

app.post('/subscribe', (req, res) => {
  const { subscription, lat, lng, threshold = 3 } = req.body;
  if (!subscription?.endpoint || lat == null || lng == null) {
    return res.status(400).json({ error: 'Puuttuvat kentät' });
  }

  // Use endpoint as ID (unique per browser+device)
  const id = subscription.endpoint;
  subscriptions.set(id, { subscription, lat, lng, threshold, prevAQ: null, lastNotified: null });
  console.log(`[api] Uusi tilaus: id=${id.slice(-20)} threshold=${threshold}`);
  res.json({ ok: true });
});

app.post('/unsubscribe', (req, res) => {
  const { endpoint } = req.body;
  subscriptions.delete(endpoint);
  console.log(`[api] Tilaus poistettu: ${endpoint?.slice(-20)}`);
  res.json({ ok: true });
});

app.get('/health', (req, res) => res.json({ ok: true, subscriptions: subscriptions.size }));

// ── ENFUSER map ──────────────────────────────────────────────────────────────

// AQ colors 1–5 (ENFUSER uses 1–5 scale, not 1–6)
const ENFUSER_COLORS = [
  null,
  [34,  197,  94],  // 1 hyvä
  [132, 204,  22],  // 2 tyydyttävä
  [234, 179,   8],  // 3 välttävä
  [249, 115,  22],  // 4 huono
  [239,  68,  68],  // 5 erittäin huono
];

function enfuserAqRgb(aqFloat) {
  const v = Math.max(1, Math.min(5, aqFloat));
  const lo = Math.floor(v), hi = Math.min(5, lo + 1);
  const t = v - lo;
  const a = ENFUSER_COLORS[lo], b = ENFUSER_COLORS[hi];
  return [Math.round(a[0]+t*(b[0]-a[0])), Math.round(a[1]+t*(b[1]-a[1])), Math.round(a[2]+t*(b[2]-a[2]))];
}

const DOWNSAMPLE = 8;
let enfuserCache = null;
let enfuserCacheTime = 0;
const ENFUSER_TTL = 30 * 60 * 1000;

async function fetchEnfuserPng() {
  const now = new Date();
  const endStr = now.toISOString();
  const startStr = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();

  // 1. Query WFS to get file reference URL
  const wfsUrl = `https://opendata.fmi.fi/wfs?service=WFS&version=2.0.0&request=getFeature` +
    `&storedquery_id=fmi::forecast::enfuser::airquality::helsinki-metropolitan::grid` +
    `&parameters=AQIndex&starttime=${startStr}&endtime=${endStr}`;
  const wfsRes = await fetch(wfsUrl);
  if (!wfsRes.ok) throw new Error(`WFS HTTP ${wfsRes.status}`);
  const wfsXml = await wfsRes.text();

  const match = wfsXml.match(/https:\/\/opendata\.fmi\.fi\/download[^"<\s]*/);
  if (!match) throw new Error('fileReference puuttuu WFS-vastauksesta');
  const downloadUrl = match[0];

  // 2. Download NetCDF
  console.log(`[enfuser] Ladataan NetCDF...`);
  const ncRes = await fetch(downloadUrl);
  if (!ncRes.ok) throw new Error(`NetCDF HTTP ${ncRes.status}`);
  const buf = Buffer.from(await ncRes.arrayBuffer());
  console.log(`[enfuser] Ladattu ${(buf.length / 1e6).toFixed(1)} MB`);

  // 3. Parse
  const reader = new NetCDFReader(buf);
  const aqVar = reader.variables.find(v => v.name.toLowerCase().includes('airquality'));
  if (!aqVar) throw new Error('AQIndex-muuttujaa ei löydy. Muuttujat: ' + reader.variables.map(v => v.name).join(', '));

  const allData = reader.getDataVariable(aqVar.name);
  const dims = aqVar.dimensions.map(i => reader.dimensions[i]);
  const latDim = dims.find(d => d.name === 'lat') || dims[dims.length - 2];
  const lonDim = dims.find(d => d.name === 'lon') || dims[dims.length - 1];
  const nLat = latDim.size, nLon = lonDim.size;
  console.log(`[enfuser] Grid ${nLon}×${nLat}, muuttuja: ${aqVar.name}`);

  // 4. Render PNG (downsampled + block-averaged for smooth gradients)
  const pngW = Math.floor(nLon / DOWNSAMPLE);
  const pngH = Math.floor(nLat / DOWNSAMPLE);
  const png = new PNG({ width: pngW, height: pngH, filterType: -1 });

  for (let row = 0; row < pngH; row++) {
    for (let col = 0; col < pngW; col++) {
      const r0 = row * DOWNSAMPLE, c0 = col * DOWNSAMPLE;
      let sum = 0, cnt = 0;
      for (let dr = 0; dr < DOWNSAMPLE; dr++) {
        for (let dc = 0; dc < DOWNSAMPLE; dc++) {
          const v = allData[(r0 + dr) * nLon + (c0 + dc)];
          if (Number.isFinite(v) && v >= 1 && v <= 5) { sum += v; cnt++; }
        }
      }
      const i = (row * pngW + col) * 4;
      if (!cnt) { png.data[i + 3] = 0; continue; }
      const [r, g, b] = enfuserAqRgb(sum / cnt);
      png.data[i] = r; png.data[i+1] = g; png.data[i+2] = b; png.data[i+3] = 190;
    }
  }

  return new Promise((resolve, reject) => {
    const chunks = [];
    png.pack().on('data', c => chunks.push(c)).on('end', () => resolve(Buffer.concat(chunks))).on('error', reject);
  });
}

app.get('/api/enfuser-map', async (req, res) => {
  try {
    const now = Date.now();
    if (!enfuserCache || now - enfuserCacheTime > ENFUSER_TTL) {
      enfuserCache = await fetchEnfuserPng();
      enfuserCacheTime = now;
      console.log(`[enfuser] Välimuisti päivitetty, ${(enfuserCache.length / 1024).toFixed(0)} KB`);
    }
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=1800');
    res.send(enfuserCache);
  } catch (err) {
    console.error('[enfuser] Virhe:', err.message);
    res.status(503).json({ error: err.message });
  }
});

// Refresh ENFUSER cache every 2h (model runs every 2h)
cron.schedule('10 */2 * * *', async () => {
  try {
    enfuserCache = await fetchEnfuserPng();
    enfuserCacheTime = Date.now();
    console.log('[enfuser] Cron: välimuisti päivitetty');
  } catch (e) {
    console.warn('[enfuser] Cron päivitys epäonnistui:', e.message);
  }
});

// ─────────────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`PollyAir server käynnissä portissa ${PORT}`));
