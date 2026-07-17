import { FlowFormApiClient } from '@flowform/api-client'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import App from '../src/App'
import { SandboxProvider } from '../src/sandbox'
import { resetWorkspaceStore } from '../src/store'
import { createSessionFixture } from './fixtures'

describe('FlowForm Studio app shell', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
    resetWorkspaceStore()
  })

  it('opens a server-backed recruiter sandbox', async () => {
    const session = createSessionFixture()
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(session), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const client = new FlowFormApiClient('/api/v1', fetcher)
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <SandboxProvider client={client}>
          <App />
        </SandboxProvider>
      </QueryClientProvider>,
    )

    expect(await screen.findByText('Interactive portfolio demo')).toBeInTheDocument()
    expect(screen.getByText('Private demo sandbox')).toBeInTheDocument()
    expect(screen.getAllByLabelText('Workspace')).toHaveLength(2)
    expect(fetcher).toHaveBeenCalledWith(
      '/api/v1/sandboxes',
      expect.objectContaining({ method: 'POST' }),
    )
  })
})
