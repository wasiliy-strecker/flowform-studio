import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
  type ExceptionFilter,
} from '@nestjs/common'
import type { Request, Response } from 'express'

import { RequestContextService } from './request-context.service'

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ApiException')

  constructor(@Inject(RequestContextService) private readonly context: RequestContextService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp()
    const request = http.getRequest<Request>()
    const response = http.getResponse<Response>()
    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR
    const body = exception instanceof HttpException ? exception.getResponse() : undefined
    const normalized = normalizeException(status, body)
    const requestId = this.context.requestId(response)

    if (status >= 500) {
      this.logger.error({
        requestId,
        method: request.method,
        path: request.originalUrl,
        error: exception instanceof Error ? exception.stack : String(exception),
      })
    }

    response.status(status).json({
      status,
      code: normalized.code,
      message: normalized.message,
      requestId,
      ...(normalized.details === undefined ? {} : { details: normalized.details }),
    })
  }
}

function normalizeException(
  status: number,
  response: string | object | undefined,
): { code: string; message: string; details?: unknown } {
  if (typeof response === 'string') {
    return { code: statusCode(status), message: response }
  }
  if (response && 'code' in response && typeof response.code === 'string') {
    const code = response.code
    const record = response as Record<string, unknown>
    const { code: _code, message, ...details } = record
    return {
      code,
      message: typeof message === 'string' ? message : defaultMessage(status),
      ...(Object.keys(details).length === 0 ? {} : { details }),
    }
  }
  if (response && 'message' in response) {
    const message = response.message
    return {
      code: statusCode(status),
      message: Array.isArray(message)
        ? message.map(String).join(', ')
        : typeof message === 'string'
          ? message
          : defaultMessage(status),
    }
  }
  return { code: statusCode(status), message: defaultMessage(status) }
}

function statusCode(status: number): string {
  const names: Record<number, string> = {
    400: 'bad_request',
    401: 'unauthorized',
    404: 'not_found',
    409: 'conflict',
    410: 'gone',
    413: 'payload_too_large',
    500: 'internal_error',
  }
  return names[status] ?? `http_${status}`
}

function defaultMessage(status: number): string {
  return status >= 500 ? 'The server could not complete the request.' : 'The request failed.'
}
