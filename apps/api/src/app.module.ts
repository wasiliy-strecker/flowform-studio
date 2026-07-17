import { MiddlewareConsumer, Module, type NestModule, RequestMethod } from '@nestjs/common'
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core'

import { HealthController } from './health.controller'
import { ApiExceptionFilter } from './observability/api-exception.filter'
import { RequestContextService } from './observability/request-context.service'
import { RequestLoggingInterceptor } from './observability/request-logging.interceptor'
import { OutboxRelayService } from './realtime/outbox-relay.service'
import { RealtimeGateway } from './realtime/realtime.gateway'
import { SandboxCleanupService } from './sandbox/sandbox-cleanup.service'
import { createSandboxRepository } from './sandbox/sandbox-repository.provider'
import { SandboxRepositoryShutdownService } from './sandbox/sandbox-repository-shutdown.service'
import { SANDBOX_REPOSITORY } from './sandbox/sandbox.repository'
import { SandboxController } from './sandbox/sandbox.controller'
import { SandboxService } from './sandbox/sandbox.service'
import { UploadController } from './upload/upload.controller'
import { UploadService } from './upload/upload.service'

@Module({
  controllers: [HealthController, SandboxController, UploadController],
  providers: [
    { provide: SANDBOX_REPOSITORY, useFactory: createSandboxRepository },
    RequestContextService,
    SandboxService,
    UploadService,
    RealtimeGateway,
    OutboxRelayService,
    SandboxCleanupService,
    SandboxRepositoryShutdownService,
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: RequestLoggingInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextService).forRoutes({ path: '{*path}', method: RequestMethod.ALL })
  }
}
