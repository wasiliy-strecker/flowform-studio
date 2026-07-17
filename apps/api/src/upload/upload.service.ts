import type { StoredAttachment } from '@flowform/api-contracts'
import {
  BadRequestException,
  Injectable,
  OnModuleInit,
  PayloadTooLargeException,
} from '@nestjs/common'
import { Client, type BucketItem } from 'minio'
import { createHash, randomUUID } from 'node:crypto'
import { PassThrough, Readable, Transform, Writable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

export const maximumUploadBytes = 5_000_000
export const allowedUploadMediaTypes = ['application/pdf', 'image/png', 'image/jpeg'] as const
export type AllowedUploadMediaType = (typeof allowedUploadMediaTypes)[number]

export interface UploadInput {
  source: Readable
  originalName: string
  mediaType: string
  signal?: AbortSignal
}

@Injectable()
export class UploadService implements OnModuleInit {
  private readonly memoryObjects = new Map<string, Buffer>()
  private readonly bucket = process.env.MINIO_BUCKET ?? 'flowform-uploads'
  private client?: Client

  async onModuleInit(): Promise<void> {
    const endpoint = process.env.MINIO_ENDPOINT
    if (!endpoint) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('MINIO_ENDPOINT is required in production.')
      }
      return
    }
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

  async put(sandboxId: string, input: UploadInput): Promise<StoredAttachment> {
    const mediaType = allowedMediaType(input.mediaType)
    const id = randomUUID()
    const originalName = safeFilename(input.originalName)
    const objectKey = `sandboxes/${sandboxId}/${id}${extensionFor(mediaType)}`
    const inspector = new UploadInspectionTransform(mediaType, maximumUploadBytes)

    try {
      if (this.client) {
        const destination = new PassThrough()
        const upload = this.client.putObject(this.bucket, objectKey, destination, undefined, {
          'Content-Type': mediaType,
          'Content-Disposition': `attachment; filename="${originalName.replaceAll('"', '')}"`,
        })
        try {
          await Promise.all([
            pipeline(input.source, inspector, destination, signalOptions(input.signal)),
            upload,
          ])
        } catch (error) {
          destination.destroy(error instanceof Error ? error : undefined)
          throw error
        }
      } else {
        const chunks: Buffer[] = []
        const destination = new Writable({
          write(chunk: Buffer, _encoding, callback) {
            chunks.push(Buffer.from(chunk))
            callback()
          },
        })
        await pipeline(input.source, inspector, destination, signalOptions(input.signal))
        this.memoryObjects.set(objectKey, Buffer.concat(chunks))
      }
    } catch (error) {
      await this.remove(objectKey).catch(() => undefined)
      throw error
    }

    return {
      id,
      objectKey,
      originalName,
      mediaType,
      sizeBytes: inspector.sizeBytes,
      checksumSha256: inspector.checksum(),
      storage: this.client ? 'minio' : 'memory',
      createdAt: new Date().toISOString(),
    }
  }

  async remove(objectKey: string): Promise<void> {
    if (this.client) {
      await this.client.removeObject(this.bucket, objectKey)
      return
    }
    this.memoryObjects.delete(objectKey)
  }

  async deleteSandbox(sandboxId: string): Promise<void> {
    const prefix = `sandboxes/${sandboxId}/`
    if (!this.client) {
      for (const key of this.memoryObjects.keys()) {
        if (key.startsWith(prefix)) this.memoryObjects.delete(key)
      }
      return
    }

    const objects = this.client.listObjectsV2(this.bucket, prefix, true)
    const names = await new Promise<string[]>((resolve, reject) => {
      const collected: string[] = []
      objects.on('data', (object: BucketItem) => {
        if (object.name) collected.push(object.name)
      })
      objects.once('end', () => resolve(collected))
      objects.once('error', reject)
    })
    for (let index = 0; index < names.length; index += 1_000) {
      await this.client.removeObjects(this.bucket, names.slice(index, index + 1_000))
    }
  }

  async health(): Promise<'up' | 'memory'> {
    if (!this.client) return 'memory'
    const exists = await this.client.bucketExists(this.bucket)
    if (!exists) throw new Error(`Object storage bucket ${this.bucket} is unavailable.`)
    return 'up'
  }
}

class UploadInspectionTransform extends Transform {
  sizeBytes = 0
  private readonly hash = createHash('sha256')
  private readonly signature: Buffer
  private pending = Buffer.alloc(0)
  private validated = false
  private digest?: string

  constructor(
    private readonly mediaType: AllowedUploadMediaType,
    private readonly maximumBytes: number,
  ) {
    super()
    this.signature = signatureFor(mediaType)
  }

  override _transform(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.sizeBytes += chunk.length
    if (this.sizeBytes > this.maximumBytes) {
      callback(new PayloadTooLargeException(`Files may not exceed ${this.maximumBytes} bytes.`))
      return
    }
    this.hash.update(chunk)

    if (this.validated) {
      this.push(chunk)
      callback()
      return
    }

    this.pending = Buffer.concat([this.pending, chunk])
    if (this.pending.length < this.signature.length) {
      callback()
      return
    }
    if (!this.pending.subarray(0, this.signature.length).equals(this.signature)) {
      callback(new BadRequestException(`The file content is not a valid ${this.mediaType} file.`))
      return
    }
    this.validated = true
    this.push(this.pending)
    this.pending = Buffer.alloc(0)
    callback()
  }

  override _flush(callback: (error?: Error | null) => void): void {
    if (!this.validated) {
      callback(new BadRequestException(`The file content is not a valid ${this.mediaType} file.`))
      return
    }
    callback()
  }

  checksum(): string {
    this.digest ??= this.hash.digest('hex')
    return this.digest
  }
}

function allowedMediaType(input: string): AllowedUploadMediaType {
  if ((allowedUploadMediaTypes as readonly string[]).includes(input)) {
    return input as AllowedUploadMediaType
  }
  throw new BadRequestException('Only PDF, PNG, and JPEG files are accepted.')
}

function safeFilename(name: string): string {
  const normalized = name
    .normalize('NFKC')
    .replace(/[^a-zA-Z0-9._ -]/g, '_')
    .replace(/\.{2,}/g, '.')
    .trim()
    .slice(0, 120)
  return normalized || 'attachment'
}

function extensionFor(mediaType: AllowedUploadMediaType): string {
  if (mediaType === 'application/pdf') return '.pdf'
  if (mediaType === 'image/png') return '.png'
  return '.jpg'
}

function signatureFor(mediaType: AllowedUploadMediaType): Buffer {
  if (mediaType === 'application/pdf') return Buffer.from('%PDF-')
  if (mediaType === 'image/png') {
    return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  }
  return Buffer.from([0xff, 0xd8, 0xff])
}

function signalOptions(signal: AbortSignal | undefined): { signal?: AbortSignal } {
  return signal ? { signal } : {}
}

export function readableFromBuffer(value: Buffer): Readable {
  return Readable.from(value)
}
