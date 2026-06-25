
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { Logger } from './services/logger';

// Global Error Handling
window.onerror = (message, source, lineno, colno, error) => {
  Logger.error(`Global Error: ${message}`, { source, lineno, colno, stack: error?.stack });
};

window.onunhandledrejection = (event) => {
  Logger.error(`Unhandled Promise Rejection`, event.reason);
};

// Global fix: Prevent scrolling on number inputs
window.addEventListener('wheel', (e) => {
  const target = e.target as HTMLElement;
  if (target && target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'number') {
    (target as HTMLInputElement).blur();
  }
}, { passive: false });

const rootElement = document.getElementById('root');
if (!rootElement) {
  Logger.error("Could not find root element to mount to");
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
