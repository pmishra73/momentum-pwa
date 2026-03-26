// ─── Momentum PWA — Install & Push Notification Manager ──────────────────────

window.MomentumPWA = (() => {
  let deferredPrompt = null;
  let swRegistration = null;

  // ── Service Worker Registration ───────────────────────────────────────────
  async function registerSW() {
    if (!('serviceWorker' in navigator)) {
      console.warn('[PWA] Service workers not supported');
      return null;
    }
    try {
      swRegistration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      console.log('[PWA] SW registered:', swRegistration.scope);

      swRegistration.addEventListener('updatefound', () => {
        const newWorker = swRegistration.installing;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateBanner();
          }
        });
      });

      // Listen for SW messages (e.g. navigate commands from notification click)
      navigator.serviceWorker.addEventListener('message', event => {
        if (event.data?.type === 'NAVIGATE') {
          const params = new URLSearchParams(event.data.url.split('?')[1]);
          const view = params.get('view');
          if (view && window.__momentumSetView) window.__momentumSetView(view);
        }
      });

      return swRegistration;
    } catch (err) {
      console.error('[PWA] SW registration failed:', err);
      return null;
    }
  }

  // ── Install Prompt ────────────────────────────────────────────────────────
  function initInstallPrompt() {
    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      deferredPrompt = e;
      console.log('[PWA] Install prompt captured');
      // Dispatch event so React app can show the prompt UI
      window.dispatchEvent(new CustomEvent('pwa-installable'));
    });

    window.addEventListener('appinstalled', () => {
      deferredPrompt = null;
      console.log('[PWA] App installed!');
      window.dispatchEvent(new CustomEvent('pwa-installed'));
    });
  }

  async function triggerInstallPrompt() {
    if (!deferredPrompt) return false;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log('[PWA] Install outcome:', outcome);
    deferredPrompt = null;
    return outcome === 'accepted';
  }

  function isInstalled() {
    return window.matchMedia('(display-mode: standalone)').matches ||
           window.navigator.standalone === true ||
           document.referrer.includes('android-app://');
  }

  // ── Push Notifications ────────────────────────────────────────────────────
  const VAPID_PUBLIC_KEY = 'YOUR_VAPID_PUBLIC_KEY_HERE'; // Replace before deploy

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
  }

  async function requestNotificationPermission() {
    if (!('Notification' in window)) return 'unsupported';
    if (Notification.permission === 'granted') return 'granted';
    if (Notification.permission === 'denied') return 'denied';
    const permission = await Notification.requestPermission();
    return permission;
  }

  async function subscribeToPush() {
    if (!swRegistration) { console.warn('[PWA] No SW registration'); return null; }
    const permission = await requestNotificationPermission();
    if (permission !== 'granted') return null;

    try {
      const existing = await swRegistration.pushManager.getSubscription();
      if (existing) return existing;

      const subscription = await swRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });
      console.log('[PWA] Push subscribed:', JSON.stringify(subscription));
      // In production: send `subscription` JSON to your backend to store
      return subscription;
    } catch (err) {
      console.error('[PWA] Push subscription failed:', err);
      return null;
    }
  }

  async function unsubscribeFromPush() {
    if (!swRegistration) return;
    const subscription = await swRegistration.pushManager.getSubscription();
    if (subscription) { await subscription.unsubscribe(); console.log('[PWA] Push unsubscribed'); }
  }

  async function getPushStatus() {
    if (!('Notification' in window) || !('PushManager' in window)) return 'unsupported';
    if (Notification.permission === 'denied') return 'denied';
    if (!swRegistration) return 'no-sw';
    const sub = await swRegistration.pushManager.getSubscription();
    if (sub) return 'subscribed';
    return Notification.permission === 'granted' ? 'granted-not-subscribed' : 'default';
  }

  // ── Schedule local daily reminder (fallback when push server not set up) ──
  function scheduleLocalReminder(hourOfDay = 9) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const now = new Date();
    const next = new Date();
    next.setHours(hourOfDay, 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    const delay = next - now;

    setTimeout(() => {
      if (Notification.permission === 'granted') {
        const n = new Notification('Momentum 🌿', {
          body: "Time to check your habits for today!",
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-96.png',
          tag: 'daily-local',
          data: { url: '/?view=today' }
        });
        n.onclick = () => { window.focus(); n.close(); };
      }
      scheduleLocalReminder(hourOfDay); // reschedule for next day
    }, delay);

    console.log(`[PWA] Local reminder scheduled in ${Math.round(delay/60000)} min`);
  }

  // ── Update Banner ─────────────────────────────────────────────────────────
  function showUpdateBanner() {
    window.dispatchEvent(new CustomEvent('pwa-update-available'));
  }

  function applyUpdate() {
    if (swRegistration?.waiting) {
      swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
      window.location.reload();
    }
  }

  // ── Network status ────────────────────────────────────────────────────────
  function initNetworkStatus() {
    const dispatch = () => window.dispatchEvent(
      new CustomEvent('pwa-network', { detail: { online: navigator.onLine } })
    );
    window.addEventListener('online',  dispatch);
    window.addEventListener('offline', dispatch);
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  async function init() {
    initInstallPrompt();
    initNetworkStatus();
    await registerSW();
    console.log('[PWA] Momentum PWA ready. Installed:', isInstalled());
  }

  return {
    init,
    isInstalled,
    triggerInstallPrompt,
    requestNotificationPermission,
    subscribeToPush,
    unsubscribeFromPush,
    getPushStatus,
    scheduleLocalReminder,
    applyUpdate,
  };
})();

// Auto-init on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => MomentumPWA.init());
} else {
  MomentumPWA.init();
}
