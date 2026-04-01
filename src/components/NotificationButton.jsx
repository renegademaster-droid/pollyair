import { useState, useEffect } from 'react';
import { subscribePush, unsubscribePush, getSubscriptionState } from '../services/push';
import './NotificationButton.css';

const THRESHOLD = 3; // Välttävä

export function NotificationButton({ lat, lng }) {
  const [state, setState] = useState('loading'); // loading | unsupported | denied | off | on | working

  useEffect(() => {
    if (!lat || !lng) return;
    getSubscriptionState().then(setState);
  }, [lat, lng]);

  if (state === 'loading' || state === 'unsupported') return null;

  const handleClick = async () => {
    if (state === 'denied') return;
    setState('working');
    try {
      if (state === 'on') {
        await unsubscribePush();
        setState('off');
      } else {
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') { setState('denied'); return; }
        await subscribePush(lat, lng, THRESHOLD);
        setState('on');
      }
    } catch (e) {
      console.error('Push-ilmoitusvirhe:', e);
      setState('off');
    }
  };

  const icon   = state === 'on' ? '🔔' : state === 'denied' ? '🔕' : '🔔';
  const active = state === 'on';
  const title  = state === 'on' ? 'Ilmoitukset päällä — paina poistaaksesi'
               : state === 'denied' ? 'Ilmoitukset estetty selaimen asetuksissa'
               : 'Salli ilmoitukset ilmanlaadun muutoksista';

  return (
    <button
      className={`notif-btn${active ? ' notif-btn--active' : ''}`}
      onClick={handleClick}
      disabled={state === 'working' || state === 'denied'}
      title={title}
      aria-label={title}
    >
      {icon}
    </button>
  );
}
