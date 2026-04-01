const OPEN_METEO_AQ = 'https://air-quality-api.open-meteo.com/v1/air-quality';

export async function fetchPollen(lat, lng) {
  try {
    const params = new URLSearchParams({
      latitude: lat,
      longitude: lng,
      current: 'birch_pollen,alder_pollen,grass_pollen,mugwort_pollen',
      timezone: 'auto',
    });
    const res = await fetch(`${OPEN_METEO_AQ}?${params}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const c = data.current ?? {};
    return {
      birch:    c.birch_pollen    ?? null,
      alder:    c.alder_pollen    ?? null,
      grass:    c.grass_pollen    ?? null,
      mugwort:  c.mugwort_pollen  ?? null,
    };
  } catch {
    return null;
  }
}
