import { describe, expect, it, vi } from 'vitest'

import { FlowFormApiClient } from '../src'

describe('FlowFormApiClient', () => {
  it('sends the sandbox token only to protected operations', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const client = new FlowFormApiClient('https://example.test/api/v1', fetcher)
    await client.getSandbox('sandbox-1', 'secret-token')
    const request = fetcher.mock.calls[0]
    expect(request?.[0]).toBe('https://example.test/api/v1/sandboxes/sandbox-1')
    expect(new Headers(request?.[1]?.headers).get('x-sandbox-token')).toBe('secret-token')
  })
})
