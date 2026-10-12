import '@fontsource/noto-sans-kannada/400.css';
import '@fontsource/noto-sans-kannada/700.css';
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ToastContainer } from './components/ui/ToastContainer';
import './index.css';
import { registerServiceWorker } from './lib/pwa';
import { startOutboxListener } from './lib/offline/syncEngine';

// Start PWA Service Worker & Background Sync Engine
registerServiceWorker();
startOutboxListener();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <ToastContainer />
  </StrictMode>,
);

