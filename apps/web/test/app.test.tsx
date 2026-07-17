import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it } from 'vitest'

import App from '../src/App'
import { resetWorkspaceStore } from '../src/store'

describe('FlowForm Studio app shell', () => {
  beforeEach(() => resetWorkspaceStore())

  it('opens directly in the interactive recruiter sandbox', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>,
    )
    expect(await screen.findByText('Interactive portfolio demo')).toBeInTheDocument()
    expect(screen.getByText('Private demo sandbox')).toBeInTheDocument()
    expect(screen.getAllByLabelText('Workspace')).toHaveLength(2)
  })
})
