import { Module } from '@nestjs/common'

import { HealthController } from './health.controller'
import { RealtimeGateway } from './realtime/realtime.gateway'
import { SandboxController } from './sandbox/sandbox.controller'
import { SandboxService } from './sandbox/sandbox.service'
import { UploadController } from './upload/upload.controller'
import { UploadService } from './upload/upload.service'

@Module({
  controllers: [HealthController, SandboxController, UploadController],
  providers: [SandboxService, RealtimeGateway, UploadService],
})
export class AppModule {}
