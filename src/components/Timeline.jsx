import { useRef, useEffect } from 'react';
import './Timeline.css';

function riskColor(risk) {
  if (risk < 0.33) return 'var(--color-low)';
  if (risk < 0.66) return 'var(--color-medium)';
  return 'var(--color-high)';
}

export function Timeline({ hourlyRisk }) {
  const scrollRef = useRef(null);
  const currentHour = new Date().getHours();

  useEffect(() => {
    if (!scrollRef.current || !hourlyRisk.length) return;
    const items = scrollRef.current.querySelectorAll('.tl-item');
    const current = items[currentHour];
    if (current) current.scrollIntoView({ inline: 'center', behavior: 'smooth', block: 'nearest' });
  }, [hourlyRisk, currentHour]);

  const maxRisk = Math.max(...hourlyRisk.map(h => h.risk), 0.01);

  return (
    <div className="timeline">
      <div className="timeline__header">
        <span className="timeline__title">Siitepölytaso tänään</span>
        <span className="timeline__legend">
          <span style={{ color: 'var(--color-low)' }}>matala</span>
          <span style={{ color: 'var(--color-medium)' }}>koht.</span>
          <span style={{ color: 'var(--color-high)' }}>korkea</span>
        </span>
      </div>
      <div className="timeline__scroll" ref={scrollRef}>
        {hourlyRisk.map(({ hour, risk }) => {
          const isCurrent = hour === currentHour;
          const barH = Math.max(4, Math.round((risk / maxRisk) * 36));
          return (
            <div key={hour} className={`tl-item${isCurrent ? ' tl-item--current' : ''}`}>
              <div className="tl-bar-wrap">
                <div
                  className="tl-bar"
                  style={{ height: `${barH}px`, background: riskColor(risk) }}
                />
              </div>
              <span className="tl-hour">{hour}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
