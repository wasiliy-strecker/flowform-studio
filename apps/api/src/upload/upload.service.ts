import { Injectable, OnModuleInit } from '@nestjs/common'
import { Client } from 'minio'
import { randomUUID } from 'node:crypto'

export interface StoredAttachment {
  id: string
  objectKey: string
  originalName: string
  mediaType: string
  sizeBytes: number
  storage: 'memory' | 'minio'
}

@Injectable()
export class UploadService implements OnModuleInit {
  private readonly memoryObjects = new Map<string, Buffer>()
  private readonly bucket = process.env.MINIO_BUCKET ?? 'flowform-uploads'
  private client?: Client

  async onModuleInit(): Promise<void> {
    const endpoint = process.env.MINIO_ENDPOINT
    if (!endpoint) return
    this.client = new Client({
      endPoint: endpoint,
      port: Number(process.env.MINIO_PORT ?? 9000),
      useSSL: process.env.MINIO_USE_SSL === 'true',
      accessKey: process.env.MINIO_ACCESS_KEY ?? 'flowform',
      secretKey: process.env.MINIO_SECRET_KEY ?? 'change-me-in-production',
    })
    const exists = await this.client.bucketExists(this.bucket)
    if (!exists) await this.client.makeBucket(this.bucket)
  }

  async put(sandboxId: string, file: Express.Multer.File): Promise<StoredAttachment> {
    const id = randomUUID()
    const extension = extensionFor(file.mimetype)
    const objectKey = `sandboxes/${sandboxId}/${id}${extension}`
    if (this.client) {
      await this.client.putObject(this.bucket, objectKey, file.buffer, file.size, {
        'Content-Type': file.mimetype,
        'Content-Disposition': `attachment; filename="${safeFilename(file.originalname)}"`,
      })
    } else {
      this.memoryObjects.set(objectKey, Buffer.from(file.buffer))
    }
    return {
      id,
      objectKey,
      originalName: safeFilename(file.originalname),
      mediaType: file.mimetype,
      sizeBytes: file.size,
      storage: this.client ? 'minio' : 'memory',
    }
  }
}

function safeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 120)
}

function extensionFor(mediaType: string): string {
  if (mediaType === 'application/pdf') return '.pdf'
  if (mediaType === 'image/png') return '.png'
  if (mediaType === 'image/jpeg') return '.jpg'
  return ''
}
