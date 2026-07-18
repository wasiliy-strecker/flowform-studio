import { describe, expect, it, vi } from 'vitest'

import { MemorySandboxRepository } from '../src/sandbox/memory-sandbox.repository'
import { SandboxCleanupService } from '../src/sandbox/sandbox-cleanup.service'
import type { UploadService } from '../src/upload/upload.service'

describe('SandboxCleanupService', () => {
  it('retains expired metadata when object deletion fails and succeeds on retry', async () => {
    const repository = new MemorySandboxRepository()
    const sandboxId = 'expired-sandbox'
    vi.spyOn(repository, 'listExpired').mockResolvedValue([sandboxId])
    const deleteSandbox = vi
      .fn<UploadService['deleteSandbox']>()
      .mockRejectedValueOnce(new Error('Object storage unavailable.'))
      .mockResolvedValue(undefined)
    const deleteMetadata = vi.spyOn(repository, 'delete')
    const cleanup = new SandboxCleanupService(repository, {
      deleteSandbox,
    } as unknown as UploadService)

    await expect(cleanup.run()).resolves.toEqual([])
    expect(deleteMetadata).not.toHaveBeenCalled()

    await expect(cleanup.run()).resolves.toEqual([sandboxId])
    expect(deleteSandbox).toHaveBeenCalledTimes(2)
    expect(deleteMetadata).toHaveBeenCalledWith(sandboxId)
  })
})
