const express = require('express');
const cors = require('cors');
const webpush = require('web-push');
const cron = require('node-cron');

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

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`PollyAir server käynnissä portissa ${PORT}`));
