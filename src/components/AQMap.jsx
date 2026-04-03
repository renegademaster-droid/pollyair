import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from 'react-leaflet';
import { fetchAQStations } from '../services/aqmap';
import { getEnfuserBlobUrl, ENFUSER_SERVER } from '../services/enfuser';
import { AQ } from '../services/airquality';
import 'leaflet/dist/leaflet.css';
import './AQMap.css';

// ENFUSER coverage: Helsinki metropolitan area
const ENFUSER_BOUNDS = [[60.1321, 24.58], [60.368, 25.1998]];
const ENFUSER_CENTER = [60.25, 24.89]; // Helsinki metro center

const NEIGHBORHOOD_LABELS = [
  // Helsinki
  { name: 'Kallio',        lat: 60.1841, lng: 24.9524 },
  { name: 'Kamppi',        lat: 60.1686, lng: 24.9317 },
  { name: 'Punavuori',     lat: 60.1597, lng: 24.9386 },
  { name: 'Kruununhaka',   lat: 60.1710, lng: 24.9600 },
  { name: 'Sörnäinen',     lat: 60.1900, lng: 24.9637 },
  { name: 'Vallila',       lat: 60.1960, lng: 24.9530 },
  { name: 'Töölö',         lat: 60.1793, lng: 24.9200 },
  { name: 'Pasila',        lat: 60.2030, lng: 24.9300 },
  { name: 'Meilahti',      lat: 60.1909, lng: 24.8957 },
  { name: 'Lauttasaari',   lat: 60.1562, lng: 24.8870 },
  { name: 'Munkkiniemi',   lat: 60.1933, lng: 24.8700 },
  { name: 'Haaga',         lat: 60.2203, lng: 24.8980 },
  { name: 'Pitäjänmäki',   lat: 60.2133, lng: 24.8467 },
  { name: 'Kannelmäki',    lat: 60.2413, lng: 24.8734 },
  { name: 'Herttoniemi',   lat: 60.1972, lng: 25.0275 },
  { name: 'Laajasalo',     lat: 60.1617, lng: 25.0553 },
  { name: 'Itäkeskus',     lat: 60.2103, lng: 25.0797 },
  { name: 'Vuosaari',      lat: 60.2083, lng: 25.1417 },
  { name: 'Malmi',         lat: 60.2496, lng: 25.0118 },
  { name: 'Viikki',        lat: 60.2277, lng: 25.0095 },
  { name: 'Arabianranta',  lat: 60.1983, lng: 24.9779 },
  // Espoo
  { name: 'Tapiola',       lat: 60.1745, lng: 24.8050 },
  { name: 'Leppävaara',    lat: 60.2169, lng: 24.8126 },
  { name: 'Matinkylä',     lat: 60.1617, lng: 24.7426 },
  // Vantaa
  { name: 'Tikkurila',     lat: 60.2927, lng: 25.0433 },
  { name: 'Myyrmäki',      lat: 60.2681, lng: 24.8544 },
];

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
        map.setView([location.lat, location.lng], 14);
      } else {
        map.fitBounds(ENFUSER_BOUNDS, { padding: [0, 0] });
      }
    }, 60);
  }, [map, location]);
  return null;
}

function NeighborhoodLabels() {
  const map = useMap();
  useEffect(() => {
    const group = L.layerGroup();
    NEIGHBORHOOD_LABELS.forEach(({ name, lat, lng }) => {
      const icon = L.divIcon({ html: name, className: 'map-label', iconSize: null, iconAnchor: null });
      L.marker([lat, lng], { icon, interactive: false, zIndexOffset: 500 }).addTo(group);
    });

    const update = () => { map.getZoom() >= 12 ? group.addTo(map) : group.remove(); };
    map.on('zoomend', update);
    update();
    return () => { map.off('zoomend', update); group.remove(); };
  }, [map]);
  return null;
}

function EnfuserOverlay({ setEnfuserLoading }) {
  const map = useMap();
  useEffect(() => {
    let aborted = false;
    let overlay = null;

    setEnfuserLoading(true);
    getEnfuserBlobUrl()
      .then(blobUrl => {
        if (aborted || !blobUrl) return;
        overlay = L.imageOverlay(blobUrl, ENFUSER_BOUNDS, { opacity: 0.85, zIndex: 200 });
        overlay.addTo(map);
        setEnfuserLoading(false);
      })
      .catch(() => { if (!aborted) setEnfuserLoading(false); });

    return () => {
      aborted = true;
      overlay?.remove();
      setEnfuserLoading(false);
    };
  }, [map]);
  return null;
}

export function AQMap({ selectedHour, isDark, location }) {
  const [stations, setStations] = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(false);
  const [enfuserLoading, setEnfuserLoading] = useState(false);

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
        {ENFUSER_SERVER && <EnfuserOverlay setEnfuserLoading={setEnfuserLoading} />}

        {/* Neighbourhood labels above ENFUSER overlay */}
        <NeighborhoodLabels />

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
      {!ENFUSER_SERVER && (
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
