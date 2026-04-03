import { useState } from 'react';
import './AQDetails.css';

// WHO 24h guideline limits (µg/m³)
const LIMITS = { no2: 25, o3: 100, pm25: 15, pm10: 45 };
const LABELS = { no2: 'NO₂', o3: 'O₃', pm25: 'PM2.5', pm10: 'PM10' };
const DESC   = { no2: 'Typpidioksidi', o3: 'Otsoni', pm25: 'Pienhiukkaset', pm10: 'Hiukkaset' };
const INFO   = {
  no2:  'Typpidioksidi (NO₂) on liikenteen ja polttoprosessien päästö. Ärsyttää hengitysteitä ja heikentää keuhkotoimintaa. Pitoisuudet ovat korkeimmillaan ruuhka-aikoina vilkasliikenteisten teiden lähistöllä.\n\nWHO:n vuorokausiohjearvo on 25 µg/m³. Se kuvaa tasoa, jonka alapuolella pitkäaikainenkin altistuminen ei merkittävästi lisää hengitystiesairauksien riskiä.',
  o3:   'Otsoni (O₃) muodostuu auringonvalon vaikutuksesta muista päästöistä. Korkeat pitoisuudet ärsyttävät silmiä ja hengitysteitä sekä voivat heikentää keuhkotoimintaa. Esiintyy etenkin aurinkoisina kesäpäivinä.\n\nWHO:n kahdeksan tunnin ohjearvo on 100 µg/m³. Sen ylittyminen lisää keuhkotoiminnan heikkenemisen riskiä jo lyhyenkin altistumisen jälkeen.',
  pm25: 'Pienhiukkaset (PM2.5) ovat halkaisijaltaan alle 2,5 mikrometrin hiukkasia. Ne tunkeutuvat syvälle keuhkoihin ja verenkiertoon ja voivat aiheuttaa sydän- ja hengityselinsairauksia. Lähteinä liikenne, puunpoltto ja teollisuus.\n\nWHO:n vuorokausiohjearvo on 15 µg/m³. Pienhiukkaset ovat ilmansaasteista haitallisimpia, eikä täysin turvallista tasoa tunneta — siksi raja on asetettu mahdollisimman matalaksi.',
  pm10: 'Hengitettävät hiukkaset (PM10) ovat halkaisijaltaan alle 10 mikrometrin hiukkasia. Ärsyttävät hengitysteitä ja voivat pahentaa astmaa. Lähteinä katupöly, liikenne ja teollisuus.\n\nWHO:n vuorokausiohjearvo on 45 µg/m³. Sen ylittyminen lisää hengityselin- ja sydänoireiden todennäköisyyttä erityisesti herkillä väestöryhmillä, kuten lapsilla ja vanhuksilla.',
};

// Pollen thresholds (grains/m³), EAA guidelines
const POLLEN_LIMITS = { birch: 50, alder: 50, grass: 30, mugwort: 30 };
const POLLEN_LABELS = { birch: 'Koivu', alder: 'Leppä', grass: 'Heinä', mugwort: 'Pujo' };
const POLLEN_INFO   = {
  birch:   'Koivun siitepöly on Suomen yleisin allergian aiheuttaja. Sesonki on tyypillisesti huhtikuusta toukokuuhun. Voi aiheuttaa nenän tukkoisuutta, silmien kutinaa ja astmaoireita.\n\nEAA:n korkean pitoisuuden raja on 50 jyvästä kuutiometrissä (jr/m³). Sen yläpuolella useimmat koivuallergikot kokevat selviä oireita ulkona ollessaan.',
  alder:   'Lepän siitepöly on yksi ensimmäisistä keväällä ilmassa olevista allergeeneista, usein jo maaliskuussa. Ristireagoi koivun kanssa, joten koivuallergikot oireilevat usein myös lepälle.\n\nEAA:n korkean pitoisuuden raja on 50 jr/m³. Koivuallergisilla oireilu voi alkaa jo matalammillakin pitoisuuksilla ristireaktiivisuuden vuoksi.',
  grass:   'Heinäkasvien siitepöly on kesäkuusta elokuuhun esiintyvä yleinen allergeeni. Aiheuttaa heinänuhaa eli nuhaa, silmien kutinaa ja astmaoireita. Pitoisuudet ovat korkeimmillaan kuumina ja tuulisina päivinä.\n\nEAA:n korkean pitoisuuden raja on 30 jr/m³. Heinäallergikoilla oireet voimistuvat selvästi rajan ylittyessä, ja ulkoilu voi käydä hankalaksi.',
  mugwort: 'Pujon siitepöly esiintyy heinä–elokuussa. Voi aiheuttaa nuhaa ja silmäoireita. Ristireagoi joidenkin ruoka-aineiden, kuten sellerin ja porkkanan kanssa.\n\nEAA:n korkean pitoisuuden raja on 30 jr/m³. Pujoallergikoilla oireet voivat voimistua samanaikaisesti ruoka-aineallergioiden kanssa korkeilla pitoisuuksilla.',
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

function InfoSheet({ title, info, onClose }) {
  const [closing, setClosing] = useState(false);
  const handleClose = () => setClosing(true);
  return (
    <div
      className={`aq-modal-overlay${closing ? ' aq-modal-overlay--closing' : ''}`}
      onClick={handleClose}
      onAnimationEnd={closing ? onClose : undefined}
    >
      <div className={`aq-modal${closing ? ' aq-modal--closing' : ''}`} onClick={e => e.stopPropagation()}>
        <div className="aq-modal__header">
          <span className="aq-modal__title">{title}</span>
          <button className="aq-modal__close" onClick={handleClose}>✕</button>
        </div>
        <div className="aq-modal__body">
          {info.split('\n\n').map((para, i) => (
            <p key={i} className="aqd-sheet-text">{para}</p>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AQDetails({ pollutants, pollen }) {
  const [activeInfo, setActiveInfo] = useState(null); // { title, info }

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
                <div key={key} className="aqd-item" onClick={() => setActiveInfo({ title: `${LABELS[key]} – ${DESC[key]}`, info: INFO[key] })}>
                  <div className="aqd-item__header">
                    <span className="aqd-name">{LABELS[key]}</span>
                    <span className="aqd-value">{Math.round(value)} <span className="aqd-unit">µg/m³</span></span>
                  </div>
                  <div className="aqd-desc">{DESC[key]}</div>
                  <div className="aqd-dots-row">
                    <div className="aqd-dots">
                      {dots.map((filled, i) => (
                        <span key={i} className="aqd-dot" style={{ background: filled ? color : 'var(--color-border)' }} />
                      ))}
                    </div>
                    <div className="aqd-limit">WHO-raja {limit} µg/m³</div>
                  </div>
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
                <div key={key} className="aqd-item" onClick={() => setActiveInfo({ title: POLLEN_LABELS[key], info: POLLEN_INFO[key] })}>
                  <div className="aqd-item__header">
                    <span className="aqd-name">{POLLEN_LABELS[key]}</span>
                    <span className="aqd-value">{Math.round(value)} <span className="aqd-unit">jr/m³</span></span>
                  </div>
                  <div className="aqd-dots-row">
                    <div className="aqd-dots">
                      {dots.map((filled, i) => (
                        <span key={i} className="aqd-dot" style={{ background: filled ? color : 'var(--color-border)' }} />
                      ))}
                    </div>
                    <div className="aqd-limit">Korkea raja {limit} jr/m³</div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {activeInfo && (
        <InfoSheet
          title={activeInfo.title}
          info={activeInfo.info}
          onClose={() => setActiveInfo(null)}
        />
      )}
    </section>
  );
}
