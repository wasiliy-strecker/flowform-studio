import { BadRequestException, PayloadTooLargeException } from '@nestjs/common'
import { Readable } from 'node:stream'
import { describe, expect, it } from 'vitest'

import { UploadService, maximumUploadBytes } from '../src/upload/upload.service'

describe('UploadService', () => {
  it('streams a validated PDF into isolated development storage', async () => {
    const service = new UploadService()
    const attachment = await service.put('sandbox-1', {
      source: Readable.from(Buffer.from('%PDF-test')),
      originalName: '../quote.pdf',
      mediaType: 'application/pdf',
    })

    expect(attachment.storage).toBe('memory')
    expect(attachment.objectKey).toMatch(/^sandboxes\/sandbox-1\/.+\.pdf$/)
    expect(attachment.originalName).not.toContain('..')
    expect(attachment.checksumSha256).toHaveLength(64)
  })

  it('rejects spoofed file content before accepting the upload', async () => {
    const service = new UploadService()
    await expect(
      service.put('sandbox-1', {
        source: Readable.from(Buffer.from('not a PDF')),
        originalName: 'quote.pdf',
        mediaType: 'application/pdf',
      }),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('stops a stream that exceeds the configured byte limit', async () => {
    const service = new UploadService()
    const oversized = Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(maximumUploadBytes, 1)])
    await expect(
      service.put('sandbox-1', {
        source: Readable.from(oversized),
        originalName: 'large.pdf',
        mediaType: 'application/pdf',
      }),
    ).rejects.toBeInstanceOf(PayloadTooLargeException)
  })
})
