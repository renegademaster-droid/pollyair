import { AQ } from '../services/airquality';
import './AQCard.css';

function darken(hex, amount = 18) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, (n >> 16) - amount);
  const g = Math.max(0, ((n >> 8) & 0xff) - amount);
  const b = Math.max(0, (n & 0xff) - amount);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

const TREND_ICON  = { rising: '↗', stable: '→', falling: '↘' };
const TREND_LABEL = { rising: 'Heikkenemässä', stable: 'Vakaa', falling: 'Paranemassa' };
const TREND_COLOR = { rising: '#ef4444', stable: '#6b7280', falling: '#22c55e' };

export function AQCard({ currentIdx, trend, currentTime, isForecast }) {
  if (currentIdx === null) {
    return (
      <div className="aq-card aq-card--loading">
        <div className="aq-card__spinner" />
        <p>Haetaan ilmanlaatutietoja...</p>
      </div>
    );
  }

  const timeStr = currentTime
    ? currentTime.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className="aq-card" style={{
      background: `linear-gradient(150deg, ${AQ.bgColors[currentIdx]}, ${darken(AQ.bgColors[currentIdx])})`,
      border: `1.5px solid ${AQ.colors[currentIdx]}55`,
    }}>
      <div className="aq-card__index" style={{ color: AQ.colors[currentIdx] }}>
        {currentIdx}
      </div>
      <div className="aq-card__label" style={{ color: AQ.textColors[currentIdx] }}>
        {AQ.labels[currentIdx]}
      </div>
      <div className="aq-card__trend" style={{ color: TREND_COLOR[trend] }}>
        {TREND_ICON[trend]}&nbsp;{TREND_LABEL[trend]}
      </div>
      {timeStr && (
        <div className="aq-card__time" style={{ color: AQ.textColors[currentIdx], opacity: 0.75 }}>
          {isForecast ? 'Ennuste klo' : 'Mitattu klo'} {timeStr}
        </div>
      )}
    </div>
  );
}
