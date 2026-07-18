import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'

import { UploadService } from '../upload/upload.service'
import { SANDBOX_REPOSITORY, type SandboxRepository } from './sandbox.repository'

@Injectable()
export class SandboxCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SandboxCleanupService.name)
  private timer?: NodeJS.Timeout
  private running = false

  constructor(
    @Inject(SANDBOX_REPOSITORY)
    private readonly repository: SandboxRepository,
    @Inject(UploadService)
    private readonly uploads: UploadService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.run(), 60_000)
    this.timer.unref()
    void this.run()
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer)
  }

  async run(now = new Date()): Promise<string[]> {
    if (this.running) return []
    this.running = true
    try {
      const expiredIds = await this.repository.listExpired(now)
      const deletedIds: string[] = []
      for (const sandboxId of expiredIds) {
        try {
          await this.uploads.deleteSandbox(sandboxId)
          await this.repository.delete(sandboxId)
          deletedIds.push(sandboxId)
        } catch (error) {
          this.logger.error({ sandboxId, error: error instanceof Error ? error.message : error })
        }
      }
      if (deletedIds.length > 0) this.logger.log({ deletedSandboxes: deletedIds.length })
      return deletedIds
    } finally {
      this.running = false
    }
  }
}
