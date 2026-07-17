import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './App'
import './i18n'
import { SandboxProvider } from './sandbox'
import './styles.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
})

const root = document.getElementById('root')
if (!root) throw new Error('FlowForm Studio needs a root element.')

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <SandboxProvider>
        <App />
      </SandboxProvider>
    </QueryClientProvider>
  </StrictMode>,
)
