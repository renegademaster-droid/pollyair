import { useState } from 'react';
import { geocode } from '../services/routing';
import './RoutePanel.css';

const RISK_COLOR = { low: '#16a34a', medium: '#d97706', high: '#dc2626' };
const RISK_LABEL = { low: 'Matala', medium: 'Kohtalainen', high: 'Korkea' };

function fmtDist(m) {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

function fmtTime(s) {
  const min = Math.round(s / 60);
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`;
}

export function RoutePanel({ userLocation, onRoute, routes, selectedRoute, onSelectRoute, bestHour }) {
  const [dest, setDest] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(false);

  const handleSearch = async () => {
    if (!dest.trim() || !userLocation) return;
    setLoading(true);
    setError(null);
    try {
      const location = await geocode(dest.trim());
      await onRoute(location);
      setExpanded(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`panel${expanded ? ' panel--expanded' : ''}`}>
      <div className="panel__handle" onClick={() => setExpanded(v => !v)} role="button" aria-label="Laajenna paneeli" />

      {bestHour !== null && (
        <div className="panel__best-time">
          Paras aika ulos tänään: <strong>klo {bestHour}:00</strong>
        </div>
      )}

      <div className="panel__inputs">
        <div className="panel__from">
          <div className="dot dot--from" />
          <span>Nykyinen sijaintisi</span>
        </div>
        <div className="panel__to">
          <div className="dot dot--to" />
          <input
            type="text"
            placeholder="Minne? (esim. Hakaniemi)"
            value={dest}
            onChange={e => setDest(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            autoCorrect="off"
          />
        </div>
        <button
          className="panel__btn"
          onClick={handleSearch}
          disabled={loading || !dest.trim()}
        >
          {loading ? 'Haetaan...' : 'Laske reitti'}
        </button>
      </div>

      {error && <div className="panel__error">{error}</div>}

      {routes && (
        <div className="panel__routes">
          {routes.map((route, i) => (
            <button
              key={i}
              className={`route-card${i === selectedRoute ? ' route-card--active' : ''}`}
              onClick={() => onSelectRoute(i)}
            >
              <div className="route-card__top">
                <span className="route-card__label">{route.label}</span>
                {route.isBestExposure && routes.length > 1 && (
                  <span className="route-card__badge">Vähiten koivuja</span>
                )}
                <span className="route-card__risk" style={{ color: RISK_COLOR[route.riskLevel] }}>
                  {RISK_LABEL[route.riskLevel]}
                </span>
              </div>
              <div className="route-card__meta">
                <span>{fmtDist(route.distance)}</span>
                <span>{fmtTime(route.duration)}</span>
                <span>{route.exposure.count} koivua reitin varrella</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
