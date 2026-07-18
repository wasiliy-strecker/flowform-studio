import { describe, expect, it, vi } from 'vitest'

import { FlowFormApiClient } from '../src'

describe('FlowFormApiClient', () => {
  it('sends the sandbox token only to protected operations', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'sandbox-1',
          expiresAt: new Date().toISOString(),
          activeRole: 'designer',
          revision: 1,
          form: {
            schemaVersion: 1,
            id: 'form',
            title: 'Form',
            pages: [{ id: 'page', title: 'Page', fields: [] }],
            settings: { defaultLocale: 'en', currency: 'EUR' },
          },
          workflow: {
            schemaVersion: 1,
            id: 'workflow',
            name: 'Workflow',
            nodes: [
              { id: 'start', type: 'start', position: { x: 0, y: 0 }, data: { label: 'Start' } },
              {
                id: 'end',
                type: 'end',
                position: { x: 1, y: 0 },
                data: { label: 'End', outcome: 'approved' },
              },
            ],
            edges: [{ id: 'edge', source: 'start', target: 'end' }],
          },
          publishedVersionCount: 0,
          attachments: [],
          audit: [],
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    )
    const client = new FlowFormApiClient('https://example.test/api/v1', fetcher)
    await client.getSandbox('sandbox-1', 'secret-token')
    const request = fetcher.mock.calls[0]
    expect(request?.[0]).toBe('https://example.test/api/v1/sandboxes/sandbox-1')
    expect(new Headers(request?.[1]?.headers).get('x-sandbox-token')).toBe('secret-token')
  })

  it('rejects a successful response that violates the runtime contract', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ id: 'not-a-sandbox' }), { status: 200 }))
    const client = new FlowFormApiClient('https://example.test/api/v1', fetcher)

    await expect(client.getSandbox('sandbox-1', 'secret-token')).rejects.toMatchObject({
      status: 502,
      code: 'invalid_api_response',
    })
  })
})
