import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common'
import type { Request, Response } from 'express'
import type { Observable } from 'rxjs'
import { finalize } from 'rxjs'

import { RequestContextService } from './request-context.service'

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('Http')

  constructor(@Inject(RequestContextService) private readonly context: RequestContextService) {}

  intercept(execution: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = execution.switchToHttp().getRequest<Request>()
    const response = execution.switchToHttp().getResponse<Response>()
    const startedAt = performance.now()
    return next.handle().pipe(
      finalize(() => {
        this.logger.log({
          requestId: this.context.requestId(response),
          method: request.method,
          path: request.originalUrl,
          status: response.statusCode,
          durationMs: Math.round((performance.now() - startedAt) * 10) / 10,
        })
      }),
    )
  }
}
