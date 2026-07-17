import type { StoredAttachment } from '@flowform/api-contracts'
import {
  BadRequestException,
  Controller,
  Headers,
  Inject,
  Param,
  PayloadTooLargeException,
  Post,
  Req,
} from '@nestjs/common'
import { ApiConsumes, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger'
import Busboy from 'busboy'
import type { Request } from 'express'

import { SandboxService } from '../sandbox/sandbox.service'
import { UploadService, maximumUploadBytes } from './upload.service'

@ApiTags('attachments')
@Controller('sandboxes/:sandboxId/attachments')
export class UploadController {
  constructor(
    @Inject(SandboxService)
    private readonly sandboxes: SandboxService,
    @Inject(UploadService)
    private readonly uploads: UploadService,
  ) {}

  @Post()
  @ApiSecurity('sandbox')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Stream a private sandbox attachment up to 5 MB' })
  async upload(
    @Param('sandboxId') sandboxId: string,
    @Headers('x-sandbox-token') token: string | undefined,
    @Req() request: Request,
  ): Promise<StoredAttachment> {
    await this.sandboxes.assertAccess(sandboxId, token)
    const attachment = await this.readMultipartUpload(sandboxId, request)
    try {
      await this.sandboxes.recordAttachment(sandboxId, token, attachment)
      return attachment
    } catch (error) {
      await this.uploads.remove(attachment.objectKey).catch(() => undefined)
      throw error
    }
  }

  private async readMultipartUpload(
    sandboxId: string,
    request: Request,
  ): Promise<StoredAttachment> {
    let parser: ReturnType<typeof Busboy>
    try {
      parser = Busboy({
        headers: request.headers,
        limits: { fileSize: maximumUploadBytes, files: 1, fields: 0 },
      })
    } catch {
      throw new BadRequestException('A multipart form upload is required.')
    }

    const abortController = new AbortController()
    request.once('aborted', () => abortController.abort())
    let fileUpload: Promise<StoredAttachment> | undefined
    let fileLimitReached = false

    parser.on('file', (fieldName, source, info) => {
      if (fieldName !== 'file' || fileUpload) {
        source.resume()
        return
      }
      source.once('limit', () => {
        fileLimitReached = true
      })
      fileUpload = this.uploads.put(sandboxId, {
        source,
        originalName: info.filename,
        mediaType: info.mimeType,
        signal: abortController.signal,
      })
      void fileUpload.catch(() => undefined)
    })

    const parsing = new Promise<void>((resolve, reject) => {
      parser.once('finish', resolve)
      parser.once('error', reject)
      parser.once('filesLimit', () => reject(new BadRequestException('Only one file is accepted.')))
    })
    request.pipe(parser)
    await parsing
    if (!fileUpload) throw new BadRequestException('A file is required.')

    const attachment = await fileUpload
    if (fileLimitReached) {
      await this.uploads.remove(attachment.objectKey).catch(() => undefined)
      throw new PayloadTooLargeException(`Files may not exceed ${maximumUploadBytes} bytes.`)
    }
    return attachment
  }
}
