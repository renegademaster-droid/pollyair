import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip, ImageOverlay, useMap } from 'react-leaflet';
import { fetchAQStations } from '../services/aqmap';
import { AQ } from '../services/airquality';
import 'leaflet/dist/leaflet.css';
import './AQMap.css';

const FINLAND_BOUNDS = [[59, 19], [71, 32]];
const FINLAND_CENTER = [65, 26];
const FINLAND_ZOOM = 5;

// AQ index RGB colors matching the app palette
const AQ_RGB = [
  null,
  [34,  197,  94],  // 1 good
  [132, 204,  22],  // 2 satisfactory
  [234, 179,   8],  // 3 moderate
  [249, 115,  22],  // 4 bad
  [239,  68,  68],  // 5 very bad
  [168,  85, 247],  // 6 dangerous
];

function lerpColor(c1, c2, t) {
  return [
    Math.round(c1[0] + t * (c2[0] - c1[0])),
    Math.round(c1[1] + t * (c2[1] - c1[1])),
    Math.round(c1[2] + t * (c2[2] - c1[2])),
  ];
}

function aqToRgb(aqFloat) {
  const clamped = Math.max(1, Math.min(6, aqFloat));
  const low = Math.floor(clamped);
  const high = Math.min(6, low + 1);
  return lerpColor(AQ_RGB[low], AQ_RGB[high], clamped - low);
}

function generateHeatmap(stations) {
  const W = 160;
  const H = 140;
  const [[minLat, minLng], [maxLat, maxLng]] = FINLAND_BOUNDS;
  const latRange = maxLat - minLat;
  const lngRange = maxLng - minLng;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(W, H);

  const MAX_DIST2 = 3.5 * 3.5; // degrees squared (~350km)
  const FULL_DIST2 = 0.4 * 0.4;

  for (let y = 0; y < H; y++) {
    const lat = maxLat - (y / H) * latRange;
    const cosLat = Math.cos(lat * Math.PI / 180);

    for (let x = 0; x < W; x++) {
      const lng = minLng + (x / W) * lngRange;

      let weightedSum = 0;
      let totalWeight = 0;
      let minDist2 = Infinity;

      for (const s of stations) {
        const dlat = lat - s.lat;
        const dlng = (lng - s.lng) * cosLat;
        const dist2 = dlat * dlat + dlng * dlng;

        if (dist2 < minDist2) minDist2 = dist2;
        if (dist2 === 0) { weightedSum = s.aqindex * 1e12; totalWeight = 1e12; break; }
        if (dist2 > MAX_DIST2) continue;

        const w = 1 / dist2;
        weightedSum += s.aqindex * w;
        totalWeight += w;
      }

      const i = 4 * (y * W + x);
      if (!totalWeight) { img.data[i + 3] = 0; continue; }

      const aq = weightedSum / totalWeight;
      const [r, g, b] = aqToRgb(aq);

      // Fade alpha smoothly based on nearest station distance
      const alpha = minDist2 < FULL_DIST2
        ? 185
        : minDist2 > MAX_DIST2
        ? 0
        : Math.round(185 * (1 - (minDist2 - FULL_DIST2) / (MAX_DIST2 - FULL_DIST2)));

      img.data[i]     = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = alpha;
    }
  }

  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL();
}

// Invalidates map size when container becomes visible
function MapResizer() {
  const map = useMap();
  useEffect(() => { setTimeout(() => map.invalidateSize(), 50); }, [map]);
  return null;
}

export function AQMap({ selectedHour }) {
  const [stations, setStations] = useState([]);
  const [heatUrl, setHeatUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(false);
    const time = selectedHour && !selectedHour.isForecast ? selectedHour.time : null;
    fetchAQStations(time)
      .then(data => {
        setStations(data);
        if (data.length) setHeatUrl(generateHeatmap(data));
        setLoading(false);
      })
      .catch(() => { setError(true); setLoading(false); });
  }, [selectedHour]);

  const timeLabel = selectedHour && !selectedHour.isForecast
    ? selectedHour.time.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className="aq-map">
      <MapContainer
        center={FINLAND_CENTER}
        zoom={FINLAND_ZOOM}
        className="aq-map__leaflet"
        zoomControl={false}
      >
        <MapResizer />
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
        />
        {heatUrl && (
          <ImageOverlay
            url={heatUrl}
            bounds={FINLAND_BOUNDS}
            opacity={1}
            zIndex={200}
          />
        )}
        {stations.map((s, i) => (
          <CircleMarker
            key={i}
            center={[s.lat, s.lng]}
            radius={5}
            pathOptions={{
              fillColor: AQ.colors[s.aqindex] ?? '#aaa',
              fillOpacity: 1,
              color: '#fff',
              weight: 1.5,
            }}
          >
            <Tooltip direction="top" offset={[0, -6]}>
              <span className="aq-map__tooltip">
                {s.name && <strong>{s.name}</strong>}
                <span>Ilmanlaatu {s.aqindex} — {AQ.labels[s.aqindex]}</span>
              </span>
            </Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>

      {loading && (
        <div className="aq-map__overlay">
          <div className="spinner" />
        </div>
      )}
      {error && (
        <div className="aq-map__overlay aq-map__overlay--error">
          Karttatietojen haku epäonnistui
        </div>
      )}
      {timeLabel && !loading && (
        <div className="aq-map__time-badge">{timeLabel}</div>
      )}

      <div className="aq-map__legend">
        {[1,2,3,4,5,6].map(n => (
          <div key={n} className="aq-map__legend-item">
            <span className="aq-map__legend-dot" style={{ background: AQ.colors[n] }} />
            <span>{n}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
