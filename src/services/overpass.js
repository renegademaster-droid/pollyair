const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

export async function fetchBirchTrees(lat, lng, radiusMeters = 3000) {
  const query = `
[out:json][timeout:20];
(
  node["natural"="tree"]["genus"="Betula"](around:${radiusMeters},${lat},${lng});
  node["natural"="tree"]["species"~"[Bb]etula"](around:${radiusMeters},${lat},${lng});
  node["natural"="tree"]["taxon"~"[Bb]etula"](around:${radiusMeters},${lat},${lng});
  node["natural"="tree"]["name"~"[Kk]oivu|[Bb]irch",i](around:${radiusMeters},${lat},${lng});
  node["natural"="tree"]["leaf_type"="broadleaved"]["species:fi"~"[Kk]oivu"](around:${radiusMeters},${lat},${lng});
);
out body;
`.trim();

  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
  });

  if (!res.ok) throw new Error(`Overpass error: ${res.status}`);

  const data = await res.json();

  return {
    type: 'FeatureCollection',
    features: data.elements.map(el => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [el.lon, el.lat] },
      properties: { id: el.id },
    })),
  };
}
