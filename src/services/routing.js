import * as turf from '@turf/turf';

const OSRM_BASE = 'https://router.project-osrm.org/route/v1/foot';
const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search';

export async function geocode(query) {
  const params = new URLSearchParams({
    q: query,
    format: 'json',
    limit: '1',
    'accept-language': 'fi,en',
  });

  const res = await fetch(`${NOMINATIM_BASE}?${params}`, {
    headers: { 'User-Agent': 'Koivuikkuna/1.0' },
  });

  if (!res.ok) throw new Error('Geokoodaus epäonnistui');

  const data = await res.json();
  if (!data.length) throw new Error(`Paikkaa ei löydy: "${query}"`);

  return {
    lat: parseFloat(data[0].lat),
    lng: parseFloat(data[0].lon),
    name: data[0].display_name.split(',')[0],
  };
}

function scoreExposure(routeGeometry, birchTrees) {
  if (!birchTrees?.features?.length) return { count: 0, score: 0, distKm: 0 };

  try {
    const lineFeature = { type: 'Feature', geometry: routeGeometry, properties: {} };
    const buffered = turf.buffer(lineFeature, 50, { units: 'meters' });
    if (!buffered) return { count: 0, score: 0, distKm: 0 };

    let count = 0;
    for (const tree of birchTrees.features) {
      if (turf.booleanPointInPolygon(tree, buffered)) count++;
    }

    const distKm = turf.length(lineFeature, { units: 'kilometers' });
    const score = distKm > 0 ? count / distKm : 0;

    return { count, score, distKm };
  } catch {
    return { count: 0, score: 0, distKm: 0 };
  }
}

function riskLevel(score) {
  if (score < 2) return 'low';
  if (score < 6) return 'medium';
  return 'high';
}

export async function calculateRoutes(from, to, birchTrees) {
  const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`;
  const url = `${OSRM_BASE}/${coords}?overview=full&geometries=geojson&alternatives=true&steps=false`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Reititysvirhe: ${res.status}`);

  const data = await res.json();
  if (data.code !== 'Ok' || !data.routes?.length) {
    throw new Error('Reittejä ei löydy');
  }

  const routes = data.routes.map((r, i) => {
    const exposure = scoreExposure(r.geometry, birchTrees);
    return {
      index: i,
      geometry: r.geometry,
      distance: r.distance,
      duration: r.duration,
      exposure,
      riskLevel: riskLevel(exposure.score),
    };
  });

  // Merkitään vähiten altistava reitti
  const minExposureIdx = routes.reduce(
    (best, r) => r.exposure.score < routes[best].exposure.score ? r.index : best,
    0
  );

  return routes.map(r => ({
    ...r,
    label: r.index === 0 ? 'Nopein reitti' : `Vaihtoehto ${r.index}`,
    isBestExposure: r.index === minExposureIdx,
  }));
}
