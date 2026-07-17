import { describe, expect, it } from 'vitest'

import { RealtimeEventSchema, RealtimeReadySchema } from '../src'

describe('realtime contracts', () => {
  it('requires an aggregate version for durable events', () => {
    expect(
      RealtimeEventSchema.safeParse({
        id: 'event-1',
        sandboxId: 'sandbox-1',
        occurredAt: new Date().toISOString(),
        type: 'sandbox.changed',
        payload: { reason: 'form.draftUpdated' },
      }).success,
    ).toBe(false)
  })

  it('validates the server-side authentication acknowledgement', () => {
    expect(
      RealtimeReadySchema.parse({
        sandboxId: 'sandbox-1',
        connectedAt: new Date().toISOString(),
      }),
    ).toMatchObject({ sandboxId: 'sandbox-1' })
  })
})
