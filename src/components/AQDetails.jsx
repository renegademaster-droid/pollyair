import { useState } from 'react';
import './AQDetails.css';

// WHO 24h guideline limits (µg/m³)
const LIMITS = { no2: 25, o3: 100, pm25: 15, pm10: 45 };
const LABELS = { no2: 'NO₂', o3: 'O₃', pm25: 'PM2.5', pm10: 'PM10' };
const DESC   = { no2: 'Typpidioksidi', o3: 'Otsoni', pm25: 'Pienhiukkaset', pm10: 'Hiukkaset' };
const INFO   = {
  no2: 'Typpidioksidi (NO₂) on liikenteen ja polttoprosessien päästö. Ärsyttää hengitysteitä ja heikentää keuhkotoimintaa. Pitoisuudet ovat korkeimmillaan ruuhka-aikoina vilkasliikenteisten teiden lähistöllä.',
  o3:  'Otsoni (O₃) muodostuu auringonvalon vaikutuksesta muista päästöistä. Korkeat pitoisuudet ärsyttävät silmiä ja hengitysteitä sekä voivat heikentää keuhkotoimintaa. Esiintyy etenkin aurinkoisina kesäpäivinä.',
  pm25: 'Pienhiukkaset (PM2.5) ovat halkaisijaltaan alle 2,5 mikrometrin hiukkasia. Ne tunkeutuvat syvälle keuhkoihin ja verenkiertoon ja voivat aiheuttaa sydän- ja hengityselinsairauksia. Lähteinä liikenne, puunpoltto ja teollisuus.',
  pm10: 'Hengitettävät hiukkaset (PM10) ovat halkaisijaltaan alle 10 mikrometrin hiukkasia. Ärsyttävät hengitysteitä ja voivat pahentaa astmaa. Lähteinä katupöly, liikenne ja teollisuus.',
};

// Pollen thresholds (grains/m³), EAA guidelines
const POLLEN_LIMITS  = { birch: 50, alder: 50, grass: 30, mugwort: 30 };
const POLLEN_LABELS  = { birch: 'Koivu', alder: 'Leppä', grass: 'Heinä', mugwort: 'Pujo' };
const POLLEN_INFO    = {
  birch:   'Koivun siitepöly on Suomen yleisin allergian aiheuttaja. Sesonki on tyypillisesti huhtikuusta toukokuuhun. Voi aiheuttaa nenän tukkoisuutta, silmien kutinaa ja astmaoireita.',
  alder:   'Lepän siitepöly on yksi ensimmäisistä keväällä ilmassa olevista allergeeneista, usein jo maaliskuussa. Ristireagoi koivun kanssa, joten koivuallergikot oireilevat usein myös lepälle.',
  grass:   'Heinäkasvien siitepöly on kesäkuusta elokuuhun esiintyvä yleinen allergeeni. Aiheuttaa heinänuhaa eli nuhaa, silmien kutinaa ja astmaoireita. Pitoisuudet ovat korkeimmillaan kuumina ja tuulisina päivinä.',
  mugwort: 'Pujon siitepöly esiintyy heinä–elokuussa. Voi aiheuttaa nuhaa ja silmäoireita. Ristireagoi joidenkin ruoka-aineiden, kuten sellerin ja porkkanan kanssa.',
};

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
  const [expanded, setExpanded] = useState(null);

  const entries = Object.entries(pollutants).filter(([, v]) => v !== null);
  const pollenEntries = pollen
    ? Object.entries(pollen).filter(([, v]) => v !== null && v > 0)
    : [];

  if (!entries.length && !pollenEntries.length) return null;

  const toggle = (id) => setExpanded(prev => prev === id ? null : id);

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
              const open = expanded === key;
              return (
                <div key={key} className={`aqd-item${open ? ' aqd-item--open' : ''}`} onClick={() => toggle(key)}>
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
                  {open && <p className="aqd-info">{INFO[key]}</p>}
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
              const id = `pollen-${key}`;
              const open = expanded === id;
              return (
                <div key={key} className={`aqd-item${open ? ' aqd-item--open' : ''}`} onClick={() => toggle(id)}>
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
                  {open && <p className="aqd-info">{POLLEN_INFO[key]}</p>}
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
