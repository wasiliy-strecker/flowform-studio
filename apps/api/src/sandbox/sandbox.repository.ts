import type { SandboxAuditEntry, SandboxContract, StoredAttachment } from '@flowform/api-contracts'
import type { SandboxChangedEvent } from '@flowform/realtime-contracts'

export const SANDBOX_REPOSITORY = Symbol('SANDBOX_REPOSITORY')

export interface StoredSandbox extends SandboxContract {
  tokenHash: string
  aggregateVersion: number
}

export interface SandboxPersistenceChange {
  sandbox: StoredSandbox
  expectedAggregateVersion: number
  auditEntry: SandboxAuditEntry
  event: SandboxChangedEvent
  attachment?: StoredAttachment
}

export interface SandboxRepository {
  readonly kind: 'memory' | 'postgres'
  create(sandbox: StoredSandbox, event: SandboxChangedEvent): Promise<void>
  find(id: string): Promise<StoredSandbox | undefined>
  save(change: SandboxPersistenceChange): Promise<boolean>
  delete(id: string): Promise<void>
  deleteExpired(now: Date): Promise<string[]>
  listPendingEvents(limit: number): Promise<SandboxChangedEvent[]>
  recordEventAttempt(id: string): Promise<void>
  markEventPublished(id: string, publishedAt: Date): Promise<void>
  health(): Promise<void>
  close(): Promise<void>
}
