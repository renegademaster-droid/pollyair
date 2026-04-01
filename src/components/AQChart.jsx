import { useRef, useEffect, useState } from 'react';
import { AQ } from '../services/airquality';
import { AQScaleModal } from './AQScaleModal';
import './AQChart.css';

export function AQChart({ hourly, selectedHour, onSelectHour }) {
  const scrollRef = useRef(null);
  const [showScale, setShowScale] = useState(false);

  // Scroll to current time
  useEffect(() => {
    if (!scrollRef.current || !hourly.length) return;
    const now = new Date();
    const currentIdx = hourly.findIndex(h =>
      h.time.getHours() === now.getHours() &&
      h.time.getDate() === now.getDate()
    );
    if (currentIdx >= 0) {
      const items = scrollRef.current.querySelectorAll('.aqc-item');
      items[currentIdx]?.scrollIntoView({ inline: 'center', behavior: 'smooth', block: 'nearest' });
    }
  }, [hourly]);

  if (!hourly.length) return null;

  const now = new Date();

  return (
    <section className="aq-chart">
      {showScale && <AQScaleModal onClose={() => setShowScale(false)} />}
      <div className="aq-chart__header">
        <span className="aq-chart__title">Tuntitilanne</span>
        <button className="aq-chart__scale-btn" onClick={() => setShowScale(true)}>Asteikko</button>
      </div>
      <div className="aqc-scroll" ref={scrollRef}>
        {hourly.map((h, i) => {
          const isCurrent =
            h.time.getHours() === now.getHours() &&
            h.time.getDate() === now.getDate();
          const isSelected = selectedHour?.time.getTime() === h.time.getTime();
          const label = `${h.time.getHours()}`;
          const dayLabel =
            i === 0 || h.time.getHours() === 0
              ? h.time.toLocaleDateString('fi-FI', { weekday: 'short' })
              : null;

          return (
            <div
              key={i}
              className={`aqc-item${isCurrent ? ' aqc-item--current' : ''}${isSelected ? ' aqc-item--selected' : ''}`}
              onClick={() => onSelectHour(h)}
              role="button"
              tabIndex={0}
            >
              {dayLabel && <div className="aqc-day">{dayLabel}</div>}
              <div className="aqc-bar-wrap">
                <div
                  className={`aqc-bar${h.isForecast ? ' aqc-bar--forecast' : ''}`}
                  style={{
                    height: `${h.aqindex * 8}px`,
                    background: AQ.colors[h.aqindex],
                    opacity: h.isForecast ? 0.5 : 1,
                  }}
                  title={AQ.labels[h.aqindex]}
                />
              </div>
              <span className="aqc-hour">{label}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
