import { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from 'react-leaflet';
import { fetchAQStations } from '../services/aqmap';
import { AQ } from '../services/airquality';
import 'leaflet/dist/leaflet.css';
import './AQMap.css';

const FINLAND_CENTER = [65, 26];
const FINLAND_ZOOM = 5;

// Re-invalidates map size when the container becomes visible
function MapResizer() {
  const map = useMap();
  useEffect(() => {
    setTimeout(() => map.invalidateSize(), 50);
  }, [map]);
  return null;
}

export function AQMap({ selectedHour }) {
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(false);
    const time = selectedHour && !selectedHour.isForecast ? selectedHour.time : null;
    fetchAQStations(time)
      .then(data => { setStations(data); setLoading(false); })
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
        {stations.map((s, i) => (
          <CircleMarker
            key={i}
            center={[s.lat, s.lng]}
            radius={10}
            pathOptions={{
              fillColor: AQ.colors[s.aqindex] ?? '#aaa',
              fillOpacity: 0.85,
              color: '#fff',
              weight: 1.5,
            }}
          >
            <Tooltip direction="top" offset={[0, -8]}>
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
    </div>
  );
}
