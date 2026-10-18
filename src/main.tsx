import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// PWA Auto-Update Lifecycle Handler
if ('serviceWorker' in navigator) {
  let refreshing = false;

  // When a new Service Worker takes control, reload immediately to activate the new version
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');

      // Check for Service Worker updates
      const checkForUpdate = () => {
        reg.update().catch((err) => {
          console.debug('[PWA] Update check non-critical error:', err);
        });
      };

      // Listen for incoming new worker
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // New version installed! Command it to skip waiting to take over immediately
            newWorker.postMessage({ type: 'SKIP_WAITING' });
          }
        });
      });

      // If a service worker is already waiting, trigger activation
      if (reg.waiting) {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      }

      // Check for updates on window focus / app return
      window.addEventListener('focus', checkForUpdate);

      // Check for updates when page becomes visible (tab switch / unlock phone)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          checkForUpdate();
        }
      });

      // Check for updates on reconnection
      window.addEventListener('online', checkForUpdate);

      // Periodic background check every 60 seconds
      setInterval(checkForUpdate, 60000);
    } catch (err) {
      console.warn('[PWA] Service worker registration error:', err);
    }
  });
}

createRoot(document.getElementById('root')!).render(<App />);
