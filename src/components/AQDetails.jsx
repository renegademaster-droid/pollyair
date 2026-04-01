import './AQDetails.css';

// WHO 24h guideline limits (µg/m³)
const LIMITS = { no2: 25, o3: 100, pm25: 15, pm10: 45 };
const LABELS = { no2: 'NO₂', o3: 'O₃', pm25: 'PM2.5', pm10: 'PM10' };
const DESC   = { no2: 'Typpidioksidi', o3: 'Otsoni', pm25: 'Pienhiukkaset', pm10: 'Hiukkaset' };

// Pollen thresholds (grains/m³), EAA guidelines
const POLLEN_LIMITS  = { birch: 50, alder: 50, grass: 30, mugwort: 30 };
const POLLEN_LABELS  = { birch: 'Koivu', alder: 'Leppä', grass: 'Heinä', mugwort: 'Pujo' };

function levelDots(value, limit) {
  const ratio = value / limit;
  const filled = Math.min(5, Math.ceil(ratio * 3));
  return Array.from({ length: 5 }, (_, i) => i < filled);
}

function dotColor(value, limit) {
  const r = value / limit;
  if (r < 0.5) return '#22c55e';
  if (r < 1)   return '#f59e0b';
  return '#ef4444';
}

export function AQDetails({ pollutants, pollen }) {
  const entries = Object.entries(pollutants).filter(([, v]) => v !== null);
  const pollenEntries = pollen
    ? Object.entries(pollen).filter(([, v]) => v !== null && v > 0)
    : [];

  if (!entries.length && !pollenEntries.length) return null;

  return (
    <section className="aq-details">
      {entries.length > 0 && (
        <>
          <h2 className="aq-details__title">Epäpuhtaudet</h2>
          <div className="aq-details__grid">
            {entries.map(([key, value]) => {
              const limit = LIMITS[key];
              const dots = levelDots(value, limit);
              const color = dotColor(value, limit);
              return (
                <div key={key} className="aqd-item">
                  <div className="aqd-item__header">
                    <span className="aqd-name">{LABELS[key]}</span>
                    <span className="aqd-value">{Math.round(value)} <span className="aqd-unit">µg/m³</span></span>
                  </div>
                  <div className="aqd-desc">{DESC[key]}</div>
                  <div className="aqd-dots">
                    {dots.map((filled, i) => (
                      <span key={i} className="aqd-dot" style={{ background: filled ? color : 'var(--color-border)' }} />
                    ))}
                  </div>
                  <div className="aqd-limit">WHO-raja {limit} µg/m³</div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {pollenEntries.length > 0 && (
        <>
          <h2 className="aq-details__title aq-details__title--pollen">Siitepöly</h2>
          <div className="aq-details__grid">
            {pollenEntries.map(([key, value]) => {
              const limit = POLLEN_LIMITS[key];
              const dots = levelDots(value, limit);
              const color = dotColor(value, limit);
              return (
                <div key={key} className="aqd-item">
                  <div className="aqd-item__header">
                    <span className="aqd-name">{POLLEN_LABELS[key]}</span>
                    <span className="aqd-value">{Math.round(value)} <span className="aqd-unit">jr/m³</span></span>
                  </div>
                  <div className="aqd-dots">
                    {dots.map((filled, i) => (
                      <span key={i} className="aqd-dot" style={{ background: filled ? color : 'var(--color-border)' }} />
                    ))}
                  </div>
                  <div className="aqd-limit">Korkea raja {limit} jr/m³</div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
