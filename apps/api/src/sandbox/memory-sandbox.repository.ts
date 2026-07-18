import type { SandboxChangedEvent } from '@flowform/realtime-contracts'

import type {
  SandboxPersistenceChange,
  SandboxRepository,
  StoredSandbox,
} from './sandbox.repository'

interface MemoryOutboxEntry {
  event: SandboxChangedEvent
  relayedAt?: string
  relayAttempts: number
}

export class MemorySandboxRepository implements SandboxRepository {
  readonly kind = 'memory' as const
  private readonly sandboxes = new Map<string, StoredSandbox>()
  private readonly outbox = new Map<string, MemoryOutboxEntry>()

  create(sandbox: StoredSandbox, event: SandboxChangedEvent): Promise<void> {
    this.sandboxes.set(sandbox.id, structuredClone(sandbox))
    this.outbox.set(event.id, { event: structuredClone(event), relayAttempts: 0 })
    return Promise.resolve()
  }

  find(id: string): Promise<StoredSandbox | undefined> {
    const sandbox = this.sandboxes.get(id)
    return Promise.resolve(sandbox ? structuredClone(sandbox) : undefined)
  }

  save(change: SandboxPersistenceChange): Promise<boolean> {
    const current = this.sandboxes.get(change.sandbox.id)
    if (!current || current.aggregateVersion !== change.expectedAggregateVersion) {
      return Promise.resolve(false)
    }

    this.sandboxes.set(change.sandbox.id, structuredClone(change.sandbox))
    this.outbox.set(change.event.id, {
      event: structuredClone(change.event),
      relayAttempts: 0,
    })
    return Promise.resolve(true)
  }

  delete(id: string): Promise<void> {
    this.sandboxes.delete(id)
    for (const [eventId, entry] of this.outbox) {
      if (entry.event.sandboxId === id) this.outbox.delete(eventId)
    }
    return Promise.resolve()
  }

  listExpired(now: Date): Promise<string[]> {
    const expired: string[] = []
    for (const [id, sandbox] of this.sandboxes) {
      if (Date.parse(sandbox.expiresAt) > now.getTime()) continue
      expired.push(id)
    }
    return Promise.resolve(expired)
  }

  listPendingEvents(limit: number): Promise<SandboxChangedEvent[]> {
    return Promise.resolve(
      [...this.outbox.values()]
        .filter((entry) => !entry.relayedAt)
        .slice(0, limit)
        .map((entry) => structuredClone(entry.event)),
    )
  }

  recordRelayAttempt(id: string): Promise<void> {
    const entry = this.outbox.get(id)
    if (entry) entry.relayAttempts += 1
    return Promise.resolve()
  }

  markEventRelayed(id: string, relayedAt: Date): Promise<void> {
    const entry = this.outbox.get(id)
    if (entry) entry.relayedAt = relayedAt.toISOString()
    return Promise.resolve()
  }

  health(): Promise<void> {
    return Promise.resolve()
  }

  close(): Promise<void> {
    this.sandboxes.clear()
    this.outbox.clear()
    return Promise.resolve()
  }
}
