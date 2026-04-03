import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from 'react-leaflet';
import { fetchAQStations } from '../services/aqmap';
import { AQ } from '../services/airquality';
import 'leaflet/dist/leaflet.css';
import './AQMap.css';

// ENFUSER coverage: Helsinki metropolitan area
const ENFUSER_BOUNDS = [[60.1321, 24.58], [60.368, 25.1998]];
const ENFUSER_CENTER = [60.25, 24.89]; // Helsinki metro center
const FINLAND_CENTER = [65, 26];
const FINLAND_ZOOM   = 5;

const SERVER = import.meta.env.VITE_PUSH_SERVER_URL?.trim();

function isInEnfuserBounds(lat, lng) {
  return lat >= ENFUSER_BOUNDS[0][0] && lat <= ENFUSER_BOUNDS[1][0]
      && lng >= ENFUSER_BOUNDS[0][1] && lng <= ENFUSER_BOUNDS[1][1];
}

function MapResizer() {
  const map = useMap();
  useEffect(() => { setTimeout(() => map.invalidateSize(), 50); }, [map]);
  return null;
}

function MapFitter({ location }) {
  const map = useMap();
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current) return;
    fitted.current = true;
    setTimeout(() => {
      map.invalidateSize();
      if (location && isInEnfuserBounds(location.lat, location.lng)) {
        map.setView([location.lat, location.lng], 13);
      } else {
        map.fitBounds(ENFUSER_BOUNDS, { padding: [0, 0] });
      }
    }, 60);
  }, [map, location]);
  return null;
}

function EnfuserOverlay({ url, setEnfuserLoading }) {
  const map = useMap();
  useEffect(() => {
    if (!url) return;
    let aborted = false;
    let overlay = null;
    let objectUrl = null;

    setEnfuserLoading(true);
    fetch(url)
      .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.blob(); })
      .then(blob => {
        if (aborted) return;
        objectUrl = URL.createObjectURL(blob);
        overlay = L.imageOverlay(objectUrl, ENFUSER_BOUNDS, { opacity: 0.85, zIndex: 200 });
        overlay.addTo(map);
        setEnfuserLoading(false);
      })
      .catch(() => { if (!aborted) setEnfuserLoading(false); });

    return () => {
      aborted = true;
      overlay?.remove();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setEnfuserLoading(false);
    };
  }, [url, map]);
  return null;
}

export function AQMap({ selectedHour, isDark, location }) {
  const [stations, setStations] = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(false);
  const [enfuserLoading, setEnfuserLoading] = useState(false);

  const enfuserUrl = SERVER
    ? `${SERVER}/api/enfuser-map?v=${Math.floor(Date.now() / (30 * 60 * 1000))}`
    : null;

  // Fetch station data (for dots + rest-of-Finland context)
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
        center={ENFUSER_CENTER}
        zoom={11}
        className="aq-map__leaflet"
        zoomControl={false}
      >
        <MapResizer />
        <MapFitter location={location} />
        <TileLayer
          url={`https://{s}.basemaps.cartocdn.com/${isDark ? 'dark_nolabels' : 'light_nolabels'}/{z}/{x}/{y}{r}.png`}
          attribution='&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
        />

        {/* ENFUSER high-res overlay for Helsinki metro */}
        <EnfuserOverlay url={enfuserUrl} setEnfuserLoading={setEnfuserLoading} />

        {/* Station dots across Finland */}
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
      {enfuserLoading && (
        <div className="aq-map__notice">Ladataan ilmanlaatukarttaa...</div>
      )}
      {!SERVER && (
        <div className="aq-map__notice">ENFUSER ei käytössä (ei palvelinyhteyttä)</div>
      )}

      <div className="aq-map__legend">
        {[1,2,3,4,5].map(n => (
          <div key={n} className="aq-map__legend-item">
            <span className="aq-map__legend-dot" style={{ background: AQ.colors[n] }} />
            <span>{n}</span>
          </div>
        ))}
        <div className="aq-map__legend-src">ENFUSER / FMI</div>
      </div>
    </div>
  );
}
