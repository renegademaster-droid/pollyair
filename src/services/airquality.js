const FMI_WFS = 'https://opendata.fmi.fi/wfs';

function getByLocalName(el, localName) {
  const result = [];
  const all = el.getElementsByTagName('*');
  for (const node of all) {
    if (node.localName === localName) result.push(node);
  }
  return result;
}

function parseFMIXML(xmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');
  const result = {};

  for (const member of getByLocalName(doc, 'member')) {
    const propEls = getByLocalName(member, 'observedProperty');
    if (!propEls.length) continue;

    const href =
      propEls[0].getAttribute('xlink:href') ||
      propEls[0].getAttributeNS('http://www.w3.org/1999/xlink', 'href') ||
      propEls[0].getAttribute('href') || '';
    let paramName = '';
    try {
      const p = new URL(href).searchParams.get('param');
      if (p) paramName = p.split('_')[0].toLowerCase();
    } catch {}
    if (!paramName) {
      paramName = href.split(/[#/:?&=]+/).filter(Boolean).pop()?.toLowerCase() ?? '';
    }
    if (!paramName) continue;

    const series = [];
    for (const tvp of getByLocalName(member, 'MeasurementTVP')) {
      const timeEls = getByLocalName(tvp, 'time');
      const valueEls = getByLocalName(tvp, 'value');
      if (!timeEls.length || !valueEls.length) continue;
      const val = parseFloat(valueEls[0].textContent.trim());
      if (!isNaN(val)) {
        series.push({ time: new Date(timeEls[0].textContent.trim()), value: val });
      }
    }

    if (series.length) result[paramName] = series;
  }

  return result;
}

async function fmiFetch(params, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${FMI_WFS}?${params}`, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return parseFMIXML(await res.text());
  } finally {
    clearTimeout(timer);
  }
}

function fmt(d) {
  return d.toISOString().slice(0, 19) + 'Z';
}

export async function fetchAQObservations(lat, lng) {
  const now = new Date();
  const start = new Date(now - 12 * 3600 * 1000);

  return fmiFetch(new URLSearchParams({
    service: 'WFS', version: '2.0.0', request: 'getFeature',
    storedquery_id: 'fmi::observations::airquality::hourly::timevaluepair',
    latlon: `${lat},${lng}`,
    starttime: fmt(start),
    endtime: fmt(now),
    timestep: '60',
  }));
}

export async function fetchAQForecast(lat, lng) {
  const now = new Date();
  const startOfHour = new Date(now);
  startOfHour.setMinutes(0, 0, 0);
  const end = new Date(now.getTime() + 24 * 3600 * 1000);

  try {
    return await fmiFetch(new URLSearchParams({
      service: 'WFS', version: '2.0.0', request: 'getFeature',
      storedquery_id: 'fmi::forecast::silam::airquality::surface::point::timevaluepair',
      latlon: `${lat},${lng}`,
      parameters: 'NO2Concentration,O3Concentration,PM10Concentration,PM25Concentration',
      starttime: fmt(startOfHour),
      endtime: fmt(end),
      timestep: '60',
    }), 15000);
  } catch (e) {
    console.warn('[PollyAir] SILAM forecast failed:', e.message);
    return {};
  }
}

// Finnish AQ index thresholds per pollutant (µg/m³)
// Source: Finnish Meteorological Institute / SYKE
const AQ_BREAKS = {
  no2:  [0, 40,  70,  150, 200, 300],
  o3:   [0, 60,  80,  120, 160, 240],
  pm10: [0, 20,  40,   50,  75, 100],
  pm25: [0, 10,  15,   25,  40,  75],
};

function pollutantSubIndex(param, value) {
  const breaks = AQ_BREAKS[param];
  if (!breaks) return 1;
  for (let i = breaks.length - 1; i >= 0; i--) {
    if (value > breaks[i]) return i + 1;
  }
  return 1;
}

// Build per-hour AQ index from SILAM pollutant series
function computeForecastFromPollutants(fcast) {
  const hourMap = new Map();
  for (const [param, breaks] of Object.entries(AQ_BREAKS)) {
    // Flexible key match: "no2", "no2concentration", etc.
    const series = fcast[param] ||
      Object.entries(fcast).find(([k]) => k.startsWith(param))?.[1] || [];
    for (const { time, value } of series) {
      const key = time.toISOString().slice(0, 13);
      if (!hourMap.has(key)) hourMap.set(key, { time, subIndices: [] });
      hourMap.get(key).subIndices.push(pollutantSubIndex(param, value));
    }
  }
  return [...hourMap.values()]
    .map(({ time, subIndices }) => ({
      time,
      value: subIndices.length ? Math.max(...subIndices) : 1,
    }))
    .sort((a, b) => a.time - b.time);
}

// Finnish AQ index 1–6
export const AQ = {
  labels:     ['', 'Hyvä',    'Tyydyttävä', 'Välttävä', 'Huono',   'Erittäin huono', 'Vaarallinen'],
  colors:     ['', '#22c55e', '#84cc16',    '#f59e0b',  '#f97316', '#ef4444',        '#7c3aed'],
  textColors: ['', '#15803d', '#3f6212',    '#92400e',  '#9a3412', '#991b1b',        '#4c1d95'],
  bgColors:   ['', '#f0fdf4', '#f7fee7',    '#fefce8',  '#fff7ed', '#fef2f2',        '#f5f3ff'],
};

function detectTrend(series) {
  const vals = series.slice(-4).map(s => s.value);
  if (vals.length < 2) return 'stable';
  const delta = vals[vals.length - 1] - vals[0];
  if (delta >= 0.6) return 'rising';
  if (delta <= -0.6) return 'falling';
  return 'stable';
}

export function processAQData(observations, forecast) {
  // Normalize parameter keys — FMI might return "aqindex" or "AQINDEX" etc.
  const norm = (obj) => Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k.toLowerCase().replace(/[^a-z0-9]/g, ''), v])
  );
  const obs = norm(observations);
  const fcast = norm(forecast);

  const aqSeries = obs.aqindex || [];
  const latest = aqSeries.length ? aqSeries[aqSeries.length - 1] : null;
  const currentIdx = latest ? Math.max(1, Math.min(6, Math.round(latest.value))) : null;
  const trend = detectTrend(aqSeries);

  // Hourly combined timeline
  const hourlyMap = new Map();
  for (const { time, value } of aqSeries) {
    const key = time.toISOString().slice(0, 13);
    const idx = Math.max(1, Math.min(6, Math.round(value)));
    hourlyMap.set(key, { time, aqindex: idx, isForecast: false });
  }
  // Lasketaan AQ-indeksi SILAM:in epäpuhtauksista tuntikohtaisesti
  const forecastSeries = computeForecastFromPollutants(fcast);
  for (const { time, value } of forecastSeries) {
    const key = time.toISOString().slice(0, 13);
    if (!hourlyMap.has(key)) {
      const idx = Math.max(1, Math.min(6, Math.round(value)));
      hourlyMap.set(key, { time, aqindex: idx, isForecast: true });
    }
  }
  const nowHour = new Date();
  nowHour.setMinutes(0, 0, 0, 0);
  const hourly = [...hourlyMap.values()]
    .sort((a, b) => a.time - b.time)
    .filter(h => h.time >= nowHour);

  // Warning logic
  const forecastPeak = forecastSeries.length
    ? Math.max(...forecastSeries.slice(0, 6).map(h => h.value))
    : 0;
  const warning =
    (currentIdx !== null && currentIdx >= 4) ||
    (currentIdx !== null && currentIdx >= 3 && trend === 'rising') ||
    (currentIdx !== null && currentIdx < 3 && forecastPeak >= 3);

  const last = (s) => s?.length ? s[s.length - 1].value : null;

  // Build per-hour pollutant map for forecast hours
  const forecastPollutantsMap = new Map();
  for (const param of ['no2', 'o3', 'pm10', 'pm25']) {
    const series = fcast[param] ||
      Object.entries(fcast).find(([k]) => k.startsWith(param))?.[1] || [];
    for (const { time, value } of series) {
      const key = time.toISOString().slice(0, 13);
      if (!forecastPollutantsMap.has(key)) forecastPollutantsMap.set(key, {});
      forecastPollutantsMap.get(key)[param] = value;
    }
  }

  return {
    currentIdx,
    currentTime: latest?.time ?? null,
    trend,
    warning,
    hourly,
    pollutants: {
      no2:  last(obs.no2),
      o3:   last(obs.o3),
      pm25: last(obs.pm25),
      pm10: last(obs.pm10),
    },
    forecastPollutantsMap,
    hasForecast: forecastSeries.length > 0,
  };
}
