import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';
import '@fontsource/roboto/900.css';
import { createQueryClient, invalidateLog } from './api/queries.ts';
import { App } from './app/App.tsx';
import { flushOutbox } from './storage/outbox.ts';
import './styles/global.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element #root not found');

async function startMocks(): Promise<void> {
  if (import.meta.env.VITE_ENABLE_MOCKS === 'false') return;
  try {
    const { startMockApi } = await import('./api/mocks/browser.ts');
    await startMockApi();
  } catch (error) {
    // The game stays playable without the API; the captain's log shows its offline state.
    console.warn('Mock API unavailable', error);
  }
}

const queryClient = createQueryClient();

await startMocks();

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);

// Deliver results saved while offline in a previous session.
void flushOutbox().then((delivered) => {
  if (delivered > 0) void invalidateLog(queryClient);
});
