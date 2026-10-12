import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { registerServiceWorker } from './lib/pwa';
import { startOutboxListener } from './lib/offline/syncEngine';

// Start PWA Service Worker & Background Sync Engine
registerServiceWorker();
startOutboxListener();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

