import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

async function boot() {
  // Dev-only UI harness (sample data, no backend). `import.meta.env.DEV` is
  // false in production builds, so this branch and the module are removed.
  if (import.meta.env.DEV && import.meta.env.VITE_CONSOLE_MOCK === '1') {
    await import('./dev/mock');
  }
  const { App } = await import('./App');
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void boot();
