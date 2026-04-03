const SERVER = import.meta.env.VITE_PUSH_SERVER_URL?.trim();
const TTL = 30 * 60 * 1000;

let cachedBlobUrl = null;
let cacheExpiry = 0;
let inflight = null;

export const ENFUSER_SERVER = SERVER;

export function prefetchEnfuserMap() {
  if (!SERVER) return;
  getEnfuserBlobUrl().catch(() => {});
}

export function getEnfuserBlobUrl() {
  if (!SERVER) return Promise.resolve(null);
  if (cachedBlobUrl && Date.now() < cacheExpiry) return Promise.resolve(cachedBlobUrl);
  if (!inflight) {
    const url = `${SERVER}/api/enfuser-map`;
    inflight = fetch(url)
      .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.blob(); })
      .then(blob => {
        if (cachedBlobUrl) URL.revokeObjectURL(cachedBlobUrl);
        cachedBlobUrl = URL.createObjectURL(blob);
        cacheExpiry = Date.now() + TTL;
        return cachedBlobUrl;
      })
      .finally(() => { inflight = null; });
  }
  return inflight;
}
