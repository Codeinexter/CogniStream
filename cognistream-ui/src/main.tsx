import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { Toaster } from './components/ui/toaster';
import './index.css';

// Initialize TanStack query with default retry behavior
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1, // Only retry failed requests once before showing an error
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <Toaster />
    </QueryClientProvider>
  </StrictMode>
);