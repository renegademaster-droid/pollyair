const SERVER = import.meta.env.VITE_PUSH_SERVER_URL;

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

export async function registerSW() {
  if (!('serviceWorker' in navigator)) throw new Error('Service Worker ei tuettu');
  return navigator.serviceWorker.register('/sw.js');
}

export async function subscribePush(lat, lng, threshold) {
  const reg = await registerSW();

  const res = await fetch(`${SERVER}/vapid-public-key`);
  const { key } = await res.json();

  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(key),
  });

  await fetch(`${SERVER}/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription, lat, lng, threshold }),
  });

  return subscription;
}

export async function unsubscribePush() {
  const reg = await navigator.serviceWorker.getRegistration('/sw.js');
  if (!reg) return;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;

  await fetch(`${SERVER}/unsubscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  });

  await sub.unsubscribe();
}

export async function getSubscriptionState() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported';
  const perm = Notification.permission;
  if (perm === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration('/sw.js');
  if (!reg) return 'off';
  const sub = await reg.pushManager.getSubscription();
  return sub ? 'on' : 'off';
}
