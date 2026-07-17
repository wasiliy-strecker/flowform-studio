import { BeforeApplicationShutdown, Inject, Injectable } from '@nestjs/common'

import { SANDBOX_REPOSITORY, type SandboxRepository } from './sandbox.repository'

@Injectable()
export class SandboxRepositoryShutdownService implements BeforeApplicationShutdown {
  constructor(
    @Inject(SANDBOX_REPOSITORY)
    private readonly repository: SandboxRepository,
  ) {}

  async beforeApplicationShutdown(): Promise<void> {
    await this.repository.close()
  }
}
