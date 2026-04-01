const FMI_BASE = 'https://opendata.fmi.fi/wfs';

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
  const members = getByLocalName(doc, 'member');

  for (const member of members) {
    const propEls = getByLocalName(member, 'observedProperty');
    if (!propEls.length) continue;

    const href = propEls[0].getAttribute('xlink:href') || '';
    const paramName = href.split('::').pop().toLowerCase();
    if (!paramName) continue;

    const tvps = getByLocalName(member, 'MeasurementTVP');
    const series = [];

    for (const tvp of tvps) {
      const timeEls = getByLocalName(tvp, 'time');
      const valueEls = getByLocalName(tvp, 'value');
      if (!timeEls.length || !valueEls.length) continue;

      const val = parseFloat(valueEls[0].textContent.trim());
      if (!isNaN(val)) {
        series.push({ time: new Date(timeEls[0].textContent.trim()), value: val });
      }
    }

    if (series.length > 0) {
      result[paramName] = series;
    }
  }

  return result;
}

export async function fetchWeatherForecast(lat, lng) {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 0, 0, 0);

  const fmt = d => d.toISOString().slice(0, 19) + 'Z';

  const params = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'getFeature',
    storedquery_id: 'fmi::forecast::harmonie::surface::point::timevaluepair',
    latlon: `${lat},${lng}`,
    parameters: 'Temperature,WindSpeedMS,Precipitation1h,RelativeHumidity',
    starttime: fmt(start),
    endtime: fmt(end),
    timestep: '60',
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(`${FMI_BASE}?${params}`, { signal: controller.signal });
    if (!res.ok) throw new Error(`FMI API error: ${res.status}`);
    const xml = await res.text();
    return parseFMIXML(xml);
  } finally {
    clearTimeout(timer);
  }
}

function pollenRiskScore(hour, temp, humidity, windSpeed, precipitation) {
  // Sesonkikerroin: koivu kukki Suomessa n. 20.4–25.5
  const now = new Date();
  const month = now.getMonth(); // 0-indexed
  const day = now.getDate();
  let seasonFactor = 0.1;
  if (month === 3 && day >= 20) seasonFactor = 0.7;
  if (month === 3 && day >= 28) seasonFactor = 0.9;
  if (month === 4 && day <= 10) seasonFactor = 1.0;
  if (month === 4 && day <= 20) seasonFactor = 0.9;
  if (month === 4 && day <= 31) seasonFactor = 0.5;
  if (month === 5 && day <= 10) seasonFactor = 0.25;

  // Vuorokausijakauma: huippu klo 9-10, toinen klo 15
  const morning = Math.exp(-0.5 * Math.pow((hour - 9) / 2.5, 2));
  const afternoon = Math.exp(-0.5 * Math.pow((hour - 15) / 2.5, 2));
  const hourFactor = Math.max(morning, afternoon * 0.55, 0.05);

  // Lämpötila
  const tempFactor =
    temp < 5 ? 0.05 :
    temp < 10 ? 0.1 + (temp - 5) * 0.05 :
    temp < 20 ? 0.35 + (temp - 10) * 0.045 :
    Math.min(1.0, 0.8 + (temp - 20) * 0.02);

  // Sade (voimakas vähentäjä)
  const rainFactor =
    precipitation > 2 ? 0.03 :
    precipitation > 0.5 ? 0.15 :
    precipitation > 0.1 ? 0.4 :
    1.0;

  // Kosteus
  const humFactor =
    humidity > 90 ? 0.2 :
    humidity > 75 ? 0.5 :
    humidity > 60 ? 0.75 :
    1.0;

  // Tuuli (kohtalainen = enemmän leviämistä)
  const windFactor =
    windSpeed < 1 ? 0.5 :
    windSpeed < 5 ? 0.7 + windSpeed * 0.06 :
    windSpeed < 10 ? 1.0 :
    Math.max(0.5, 1.0 - (windSpeed - 10) * 0.04);

  return Math.min(1, Math.max(0,
    hourFactor * tempFactor * rainFactor * humFactor * windFactor * seasonFactor
  ));
}

export function calculateHourlyRisk(forecast) {
  const byHour = {};
  for (const key of ['temperature', 'windspeedms', 'precipitation1h', 'relativehumidity']) {
    byHour[key] = {};
    for (const { time, value } of (forecast[key] || [])) {
      byHour[key][time.getHours()] = value;
    }
  }

  return Array.from({ length: 24 }, (_, h) => {
    const temp = byHour.temperature[h] ?? 10;
    const wind = byHour.windspeedms[h] ?? 3;
    const precip = byHour.precipitation1h[h] ?? 0;
    const humidity = byHour.relativehumidity[h] ?? 65;
    const risk = pollenRiskScore(h, temp, humidity, wind, precip);
    return { hour: h, risk, temp, wind, precip, humidity };
  });
}

// Palauttaa oletusarvot ilman säädataa (pelkkä sesonki + vuorokausirytmi)
export function defaultHourlyRisk() {
  return calculateHourlyRisk({});
}
