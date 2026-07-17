import type { SandboxChangedEvent } from '@flowform/realtime-contracts'
import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { Queue, Worker, type ConnectionOptions } from 'bullmq'

import { SANDBOX_REPOSITORY, type SandboxRepository } from '../sandbox/sandbox.repository'
import { RealtimeGateway } from './realtime.gateway'

const queueName = 'flowform-realtime-events'

@Injectable()
export class OutboxRelayService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxRelayService.name)
  private queue?: Queue<SandboxChangedEvent>
  private worker?: Worker<SandboxChangedEvent>
  private timer?: NodeJS.Timeout
  private pumping = false

  constructor(
    @Inject(SANDBOX_REPOSITORY)
    private readonly repository: SandboxRepository,
    @Inject(RealtimeGateway)
    private readonly realtime: RealtimeGateway,
  ) {}

  onModuleInit(): void {
    const redisUrl = process.env.REDIS_URL
    if (redisUrl) {
      const connection = redisConnection(redisUrl)
      this.queue = new Queue<SandboxChangedEvent>(queueName, { connection })
      this.worker = new Worker<SandboxChangedEvent>(
        queueName,
        async (job) => {
          this.realtime.emitEvent(job.data)
          await this.repository.markEventPublished(job.data.id, new Date())
        },
        { connection },
      )
      this.worker.on('failed', (job, error) => {
        this.logger.error({ eventId: job?.data.id, error: error.message })
      })
    } else {
      this.logger.warn('REDIS_URL is not configured. Using the direct outbox relay.')
    }

    this.timer = setInterval(() => void this.pump(), 750)
    this.timer.unref()
    void this.pump()
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer)
    await this.worker?.close()
    await this.queue?.close()
  }

  async pump(): Promise<number> {
    if (this.pumping) return 0
    this.pumping = true
    try {
      const events = await this.repository.listPendingEvents(100)
      for (const event of events) {
        await this.repository.recordEventAttempt(event.id)
        if (this.queue) {
          await this.queue.add('deliver', event, {
            jobId: event.id,
            attempts: 5,
            backoff: { type: 'exponential', delay: 500 },
            removeOnComplete: 100,
            removeOnFail: 100,
          })
        } else {
          this.realtime.emitEvent(event)
          await this.repository.markEventPublished(event.id, new Date())
        }
      }
      return events.length
    } catch (error) {
      this.logger.error(error instanceof Error ? error.stack : String(error))
      return 0
    } finally {
      this.pumping = false
    }
  }
}

function redisConnection(redisUrl: string): ConnectionOptions {
  const url = new URL(redisUrl)
  const database = url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
    ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
    ...(Number.isInteger(database) ? { db: database } : {}),
    ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
  }
}
