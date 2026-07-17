import { Logger } from '@nestjs/common'

import { MemorySandboxRepository } from './memory-sandbox.repository'
import { PrismaSandboxRepository } from './prisma-sandbox.repository'
import type { SandboxRepository } from './sandbox.repository'

export function createSandboxRepository(): SandboxRepository {
  const databaseUrl = process.env.DATABASE_URL
  if (databaseUrl) return new PrismaSandboxRepository(databaseUrl)

  Logger.warn(
    'DATABASE_URL is not configured. Sandbox state will be lost when the API stops.',
    'SandboxRepository',
  )
  return new MemorySandboxRepository()
}
