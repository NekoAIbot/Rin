
import { createRoot } from 'react-dom/client'
import { HelmetProvider } from 'react-helmet-async'
import App from './App.tsx'
import './index.css'
import { registerSW } from 'virtual:pwa-register';

// Bootstrap theme BEFORE first paint so dark/light is persistent across every page (auth → app).
(function bootstrapTheme() {
  try {
    const saved = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const dark = saved ? saved === 'dark' : prefersDark;
    document.documentElement.classList.toggle('dark', dark);
  } catch {/* ignore */}
})();

if ('serviceWorker' in navigator) {
  registerSW({
    onNeedRefresh() { console.log('New content is available, please refresh'); },
    onOfflineReady() { console.log('App is ready for offline use'); },
  });
}

createRoot(document.getElementById("root")!).render(
  <HelmetProvider><App /></HelmetProvider>
);
