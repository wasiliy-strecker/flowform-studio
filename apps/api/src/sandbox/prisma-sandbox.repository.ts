import {
  SandboxContractSchema,
  type SandboxAuditEntry,
  type StoredAttachment,
} from '@flowform/api-contracts'
import { RealtimeEventSchema, type SandboxChangedEvent } from '@flowform/realtime-contracts'
import { PrismaPg } from '@prisma/adapter-pg'

import { Prisma, PrismaClient } from '../generated/prisma/client'
import type {
  SandboxPersistenceChange,
  SandboxRepository,
  StoredSandbox,
} from './sandbox.repository'

type SandboxRow = Prisma.DemoSandboxGetPayload<{
  include: { auditEvents: true; attachments: true }
}>

export class PrismaSandboxRepository implements SandboxRepository {
  readonly kind = 'postgres' as const
  private readonly prisma: PrismaClient

  constructor(connectionString: string) {
    this.prisma = new PrismaClient({ adapter: new PrismaPg(connectionString) })
  }

  async create(sandbox: StoredSandbox, event: SandboxChangedEvent): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.demoSandbox.create({
        data: {
          id: sandbox.id,
          tokenHash: sandbox.tokenHash,
          expiresAt: new Date(sandbox.expiresAt),
          activeRole: sandbox.activeRole,
          revision: sandbox.revision,
          aggregateVersion: sandbox.aggregateVersion,
          form: json(sandbox.form),
          workflow: json(sandbox.workflow),
          publishedVersion: sandbox.publishedVersion
            ? json(sandbox.publishedVersion)
            : Prisma.DbNull,
          submission: sandbox.submission ? json(sandbox.submission) : Prisma.DbNull,
          auditEvents: {
            create: sandbox.audit.map(auditData),
          },
          outboxEvents: {
            create: outboxData(event),
          },
        },
      })
    })
  }

  async find(id: string): Promise<StoredSandbox | undefined> {
    const row = await this.prisma.demoSandbox.findUnique({
      where: { id },
      include: {
        auditEvents: { orderBy: { occurredAt: 'desc' } },
        attachments: { orderBy: { createdAt: 'asc' } },
      },
    })
    return row ? fromRow(row) : undefined
  }

  async save(change: SandboxPersistenceChange): Promise<boolean> {
    return this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.demoSandbox.updateMany({
        where: {
          id: change.sandbox.id,
          aggregateVersion: change.expectedAggregateVersion,
        },
        data: {
          expiresAt: new Date(change.sandbox.expiresAt),
          activeRole: change.sandbox.activeRole,
          revision: change.sandbox.revision,
          aggregateVersion: change.sandbox.aggregateVersion,
          form: json(change.sandbox.form),
          workflow: json(change.sandbox.workflow),
          publishedVersion: change.sandbox.publishedVersion
            ? json(change.sandbox.publishedVersion)
            : Prisma.DbNull,
          submission: change.sandbox.submission ? json(change.sandbox.submission) : Prisma.DbNull,
        },
      })
      if (updated.count !== 1) return false

      await transaction.sandboxAuditEvent.create({
        data: { sandboxId: change.sandbox.id, ...auditData(change.auditEntry) },
      })
      if (change.attachment) {
        await transaction.attachment.create({
          data: {
            sandboxId: change.sandbox.id,
            ...attachmentData(change.attachment),
          },
        })
      }
      await transaction.outboxEvent.create({
        data: { sandboxId: change.sandbox.id, ...outboxData(change.event) },
      })
      return true
    })
  }

  async delete(id: string): Promise<void> {
    await this.prisma.demoSandbox.deleteMany({ where: { id } })
  }

  async deleteExpired(now: Date): Promise<string[]> {
    const expired = await this.prisma.demoSandbox.findMany({
      where: { expiresAt: { lte: now } },
      select: { id: true },
    })
    if (expired.length === 0) return []
    const ids = expired.map((sandbox) => sandbox.id)
    await this.prisma.demoSandbox.deleteMany({ where: { id: { in: ids } } })
    return ids
  }

  async listPendingEvents(limit: number): Promise<SandboxChangedEvent[]> {
    const rows = await this.prisma.outboxEvent.findMany({
      where: { publishedAt: null },
      orderBy: { createdAt: 'asc' },
      take: limit,
    })
    return rows.map((row) => {
      const event = RealtimeEventSchema.parse(row.payload)
      if (event.type !== 'sandbox.changed') {
        throw new Error(`Outbox event ${row.id} is not durable.`)
      }
      return event
    })
  }

  async recordEventAttempt(id: string): Promise<void> {
    await this.prisma.outboxEvent.updateMany({
      where: { id, publishedAt: null },
      data: { attempts: { increment: 1 } },
    })
  }

  async markEventPublished(id: string, publishedAt: Date): Promise<void> {
    await this.prisma.outboxEvent.updateMany({
      where: { id, publishedAt: null },
      data: { publishedAt },
    })
  }

  async health(): Promise<void> {
    await this.prisma.$queryRaw`SELECT 1`
  }

  async close(): Promise<void> {
    await this.prisma.$disconnect()
  }
}

function fromRow(row: SandboxRow): StoredSandbox {
  const contract = SandboxContractSchema.parse({
    id: row.id,
    expiresAt: row.expiresAt.toISOString(),
    activeRole: row.activeRole,
    revision: row.revision,
    form: row.form,
    workflow: row.workflow,
    ...(row.publishedVersion ? { publishedVersion: row.publishedVersion } : {}),
    ...(row.submission ? { submission: row.submission } : {}),
    attachments: row.attachments.map((attachment) => ({
      id: attachment.id,
      objectKey: attachment.objectKey,
      originalName: attachment.originalName,
      mediaType: attachment.mediaType,
      sizeBytes: attachment.sizeBytes,
      checksumSha256: attachment.checksumSha256,
      storage: attachment.storage,
      createdAt: attachment.createdAt.toISOString(),
    })),
    audit: row.auditEvents.map((entry) => ({
      id: entry.id,
      actorRole: entry.actorRole,
      action: entry.action,
      targetId: entry.targetId,
      occurredAt: entry.occurredAt.toISOString(),
    })),
  })
  return {
    ...contract,
    tokenHash: row.tokenHash,
    aggregateVersion: row.aggregateVersion,
  }
}

function auditData(entry: SandboxAuditEntry): {
  id: string
  actorRole: string
  action: string
  targetId: string
  occurredAt: Date
} {
  return {
    id: entry.id,
    actorRole: entry.actorRole,
    action: entry.action,
    targetId: entry.targetId,
    occurredAt: new Date(entry.occurredAt),
  }
}

function attachmentData(attachment: StoredAttachment): {
  id: string
  objectKey: string
  originalName: string
  mediaType: string
  sizeBytes: number
  checksumSha256: string
  storage: string
  createdAt: Date
} {
  return {
    id: attachment.id,
    objectKey: attachment.objectKey,
    originalName: attachment.originalName,
    mediaType: attachment.mediaType,
    sizeBytes: attachment.sizeBytes,
    checksumSha256: attachment.checksumSha256,
    storage: attachment.storage,
    createdAt: new Date(attachment.createdAt),
  }
}

function outboxData(event: SandboxChangedEvent): {
  id: string
  eventType: string
  payload: Prisma.InputJsonValue
  createdAt: Date
} {
  return {
    id: event.id,
    eventType: event.type,
    payload: json(event),
    createdAt: new Date(event.occurredAt),
  }
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}
