const FMI_WFS = 'https://opendata.fmi.fi/wfs';

function getByLocalName(el, localName) {
  const result = [];
  const all = el.getElementsByTagName('*');
  for (const node of all) {
    if (node.localName === localName) result.push(node);
  }
  return result;
}

// Parse simple format: each BsWfsElement has Location, Time, ParameterName, ParameterValue
function parseSimple(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  const stationMap = new Map(); // key = "lat,lng"

  for (const el of getByLocalName(doc, 'BsWfsElement')) {
    const posEl = getByLocalName(el, 'pos')[0];
    const valEl = getByLocalName(el, 'ParameterValue')[0];
    const nameEl = getByLocalName(el, 'name')[0];
    if (!posEl || !valEl) continue;

    const value = parseFloat(valEl.textContent.trim());
    if (isNaN(value) || value < 1) continue;

    const [lat, lng] = posEl.textContent.trim().split(/\s+/).map(Number);
    if (isNaN(lat) || isNaN(lng)) continue;

    const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
    const name = nameEl?.textContent?.trim() || '';

    // Keep the entry (last value per station wins — typically the most recent)
    stationMap.set(key, { lat, lng, aqindex: Math.min(6, Math.max(1, Math.round(value))), name });
  }

  return Array.from(stationMap.values());
}

export async function fetchAQStations(time) {
  // Observations have ~1-2h lag; query a 3h window ending at the selected time
  const endTime = time ? new Date(time) : new Date();
  const startTime = new Date(endTime.getTime() - 3 * 60 * 60 * 1000);

  const params = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'getFeature',
    storedquery_id: 'fmi::observations::airquality::hourly::simple',
    bbox: '19,59,32,71',
    parameters: 'AQINDEX_PT1H_avg',
    starttime: startTime.toISOString(),
    endtime: endTime.toISOString(),
  });

  const res = await fetch(`${FMI_WFS}?${params}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  return parseSimple(text);
}
