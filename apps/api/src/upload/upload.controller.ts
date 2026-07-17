import {
  BadRequestException,
  Controller,
  Headers,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiConsumes, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger'

import { SandboxService } from '../sandbox/sandbox.service'
import { UploadService, type StoredAttachment } from './upload.service'

const allowedMediaTypes = new Set(['application/pdf', 'image/png', 'image/jpeg'])

@ApiTags('attachments')
@Controller('sandboxes/:sandboxId/attachments')
export class UploadController {
  constructor(
    private readonly sandboxes: SandboxService,
    private readonly uploads: UploadService,
  ) {}

  @Post()
  @ApiSecurity('sandbox')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Store a private sandbox attachment up to 5 MB' })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5_000_000, files: 1 },
      fileFilter: (_request, file, callback) => {
        callback(
          allowedMediaTypes.has(file.mimetype)
            ? null
            : new BadRequestException('Only PDF, PNG, and JPEG files are accepted.'),
          allowedMediaTypes.has(file.mimetype),
        )
      },
    }),
  )
  async upload(
    @Param('sandboxId') sandboxId: string,
    @Headers('x-sandbox-token') token: string | undefined,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<StoredAttachment> {
    this.sandboxes.assertAccess(sandboxId, token)
    if (!file) throw new BadRequestException('A file is required.')
    if (!matchesMagicBytes(file))
      throw new BadRequestException('The file content does not match its media type.')
    const attachment = await this.uploads.put(sandboxId, file)
    this.sandboxes.recordAttachment(sandboxId, token, attachment.id)
    return attachment
  }
}

function matchesMagicBytes(file: Express.Multer.File): boolean {
  if (file.mimetype === 'application/pdf') return file.buffer.subarray(0, 5).toString() === '%PDF-'
  if (file.mimetype === 'image/png') {
    return file.buffer
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  }
  if (file.mimetype === 'image/jpeg') return file.buffer[0] === 0xff && file.buffer[1] === 0xd8
  return false
}
