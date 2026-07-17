import { describe, expect, it } from 'vitest'

import { UploadService } from '../src/upload/upload.service'

describe('UploadService', () => {
  it('uses isolated memory storage when MinIO is not configured', async () => {
    const service = new UploadService()
    const attachment = await service.put('sandbox-1', {
      fieldname: 'file',
      originalname: 'quote.pdf',
      encoding: '7bit',
      mimetype: 'application/pdf',
      size: 9,
      buffer: Buffer.from('%PDF-test'),
      stream: undefined as never,
      destination: '',
      filename: '',
      path: '',
    })
    expect(attachment.storage).toBe('memory')
    expect(attachment.objectKey).toMatch(/^sandboxes\/sandbox-1\/.+\.pdf$/)
  })
})
