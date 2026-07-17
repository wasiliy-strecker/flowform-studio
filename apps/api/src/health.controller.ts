import type { HealthResponse } from '@flowform/api-contracts'
import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'

import { SandboxService } from './sandbox/sandbox.service'
import { UploadService } from './upload/upload.service'

@ApiTags('system')
@Controller('health')
export class HealthController {
  constructor(
    @Inject(SandboxService)
    private readonly sandboxes: SandboxService,
    @Inject(UploadService)
    private readonly uploads: UploadService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Return API liveness and build identity' })
  health(): HealthResponse {
    return response('ok')
  }

  @Get('ready')
  @ApiOperation({ summary: 'Verify database and private object storage readiness' })
  async readiness(): Promise<HealthResponse> {
    try {
      await this.sandboxes.health()
      const objectStorage = await this.uploads.health()
      return response('ok', {
        database: this.sandboxes.repositoryKind() === 'postgres' ? 'up' : 'not-configured',
        objectStorage,
      })
    } catch (error) {
      throw new ServiceUnavailableException({
        code: 'not_ready',
        message: 'A required FlowForm dependency is unavailable.',
        cause: error instanceof Error ? error.message : String(error),
      })
    }
  }
}

function response(status: 'ok' | 'degraded', checks?: HealthResponse['checks']): HealthResponse {
  return {
    status,
    service: 'flowform-studio-api',
    version: '0.2.0',
    now: new Date().toISOString(),
    ...(checks ? { checks } : {}),
  }
}
