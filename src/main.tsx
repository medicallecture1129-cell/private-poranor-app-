import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// PWA Auto-Update Lifecycle Handler for Installed Standalone Apps & Browsers
declare global {
  interface Window {
    checkAppUpdate?: () => Promise<{ hasUpdate: boolean; message: string }>;
  }
}

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
      // updateViaCache: 'none' forces the browser / WebView to bypass HTTP cache when checking for sw.js updates
      const reg = await navigator.serviceWorker.register('/sw.js', { 
        updateViaCache: 'none' 
      });

      // Check for Service Worker updates
      const checkForUpdate = async () => {
        try {
          await reg.update();
        } catch (err) {
          console.debug('[PWA] Update check non-critical notice:', err);
        }
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

      // If a service worker is already waiting, trigger activation immediately
      if (reg.waiting) {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      }

      // Check for updates on window focus / app return
      window.addEventListener('focus', checkForUpdate);

      // Check for updates when page/app becomes visible (crucial for installed PWA opened from home screen)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          checkForUpdate();
        }
      });

      // Check for updates on reconnection
      window.addEventListener('online', checkForUpdate);

      // Periodic background check every 30 seconds
      setInterval(checkForUpdate, 30000);

      // Expose manual check function for UI buttons
      window.checkAppUpdate = async () => {
        try {
          await reg.update();
          if (reg.waiting || reg.installing) {
            if (reg.waiting) {
              reg.waiting.postMessage({ type: 'SKIP_WAITING' });
            }
            return { hasUpdate: true, message: 'নতুন সংস্করণ পাওয়া গেছে! অ্যাপ আপডেট করা হচ্ছে...' };
          }
          // Also perform a cache-busted fetch to test if new build exists on server
          const testRes = await fetch('/index.html?_cb=' + Date.now(), { cache: 'no-store' });
          if (testRes.ok) {
            return { hasUpdate: false, message: 'আপনার অ্যাপটি সম্পূর্ণ আপ-টু-ডেট আছে।' };
          }
          return { hasUpdate: false, message: 'আপনার অ্যাপটি আপ-টু-ডেট আছে।' };
        } catch (err) {
          return { hasUpdate: false, message: 'ইন্টারনেট সংযোগ চেক করুন।' };
        }
      };
    } catch (err) {
      console.warn('[PWA] Service worker registration error:', err);
    }
  });
}

createRoot(document.getElementById('root')!).render(<App />);
