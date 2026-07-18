import type {
  PublishedFormVersion,
  SandboxAuditEntry,
  SandboxContract,
  StoredAttachment,
} from '@flowform/api-contracts'
import type { SandboxChangedEvent } from '@flowform/realtime-contracts'

export const SANDBOX_REPOSITORY = Symbol('SANDBOX_REPOSITORY')

export type StoredSandbox = Omit<
  SandboxContract,
  'publishedVersionCount' | 'publishedVersion' | 'submissionVersion'
> & {
  tokenHash: string
  aggregateVersion: number
  publishedVersions: PublishedFormVersion[]
}

export interface SandboxPersistenceChange {
  sandbox: StoredSandbox
  expectedAggregateVersion: number
  auditEntry: SandboxAuditEntry
  event: SandboxChangedEvent
  attachment?: StoredAttachment
  publishedVersion?: PublishedFormVersion
}

export interface SandboxRepository {
  readonly kind: 'memory' | 'postgres'
  create(sandbox: StoredSandbox, event: SandboxChangedEvent): Promise<void>
  find(id: string): Promise<StoredSandbox | undefined>
  save(change: SandboxPersistenceChange): Promise<boolean>
  delete(id: string): Promise<void>
  listExpired(now: Date): Promise<string[]>
  listPendingEvents(limit: number): Promise<SandboxChangedEvent[]>
  recordRelayAttempt(id: string): Promise<void>
  markEventRelayed(id: string, relayedAt: Date): Promise<void>
  health(): Promise<void>
  close(): Promise<void>
}
