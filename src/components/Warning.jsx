import './Warning.css';

const MESSAGES = {
  serious: {
    title: 'Ilmanlaatu on heikko',
    body: 'Pitoisuudet ovat haitallisella tasolla. Vältä raskasta ulkoliikuntaa ja pidä ikkunat kiinni.',
  },
  rising: {
    title: 'Ilmanlaatu heikkenemässä',
    body: 'Pitoisuudet ovat nousussa lähitunteina. Seuraa tilannetta.',
  },
  forecast: {
    title: 'Heikkenemistä ennustettu',
    body: 'Ilmanlaatu voi heikentyä tänään. Suunnittele ulkoilu aamupäivään.',
  },
};

export function Warning({ warning, currentIdx, trend }) {
  if (!warning) return null;

  const isSerious = currentIdx >= 4;
  const msg = isSerious
    ? MESSAGES.serious
    : trend === 'rising'
    ? MESSAGES.rising
    : MESSAGES.forecast;

  return (
    <div className={`warning ${isSerious ? 'warning--serious' : 'warning--caution'}`}>
      <span className="warning__icon">{isSerious ? '⚠️' : '⚡'}</span>
      <div className="warning__body">
        <strong>{msg.title}</strong>
        <p>{msg.body}</p>
      </div>
    </div>
  );
}
