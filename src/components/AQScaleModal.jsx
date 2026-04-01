import { useState } from 'react';
import { AQ } from '../services/airquality';
import './AQScaleModal.css';

const DESCRIPTIONS = [
  'Ilmanlaatu on hyvä. Ulkoilu sopii kaikille.',
  'Ilmanlaatu on tyydyttävä. Sopii useimmille, herkille henkilöille voi olla lievää haittaa.',
  'Ilmanlaatu on välttävä. Herkille henkilöille voi aiheutua oireita. Vältä pitkää rasitusta ulkona.',
  'Ilmanlaatu on huono. Herkille merkittäviä oireita. Rajoita ulkoilua.',
  'Ilmanlaatu on erittäin huono. Kaikille terveyshaittoja. Vältä ulkoilua.',
  'Ilmanlaatu on vaarallinen. Vakava terveysriski kaikille. Pysy sisällä.',
];

export function AQScaleModal({ onClose }) {
  const [closing, setClosing] = useState(false);

  const handleClose = () => {
    setClosing(true);
  };

  return (
    <div className={`aq-modal-overlay${closing ? ' aq-modal-overlay--closing' : ''}`} onClick={handleClose} onAnimationEnd={closing ? onClose : undefined}>
      <div className={`aq-modal${closing ? ' aq-modal--closing' : ''}`} onClick={e => e.stopPropagation()}>
        <div className="aq-modal__header">
          <span className="aq-modal__title">Ilmanlaatu-asteikko</span>
          <button className="aq-modal__close" onClick={handleClose}>✕</button>
        </div>
        <div className="aq-modal__body">
          {[1, 2, 3, 4, 5, 6].map(n => (
            <div key={n} className="aq-modal__row" style={{ borderLeftColor: AQ.colors[n] }}>
              <div className="aq-modal__index" style={{ color: AQ.colors[n], background: AQ.bgColors[n] }}>
                {n}
              </div>
              <div>
                <div className="aq-modal__label" style={{ color: AQ.textColors[n] }}>{AQ.labels[n]}</div>
                <div className="aq-modal__desc">{DESCRIPTIONS[n - 1]}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
