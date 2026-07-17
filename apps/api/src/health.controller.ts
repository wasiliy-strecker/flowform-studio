import { Controller, Get } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'

@ApiTags('system')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Return API health and build identity' })
  health(): { status: 'ok'; service: string; version: string; now: string } {
    return {
      status: 'ok',
      service: 'flowform-studio-api',
      version: '0.1.0',
      now: new Date().toISOString(),
    }
  }
}
