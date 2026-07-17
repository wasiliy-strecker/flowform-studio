import { Injectable, type NestMiddleware } from '@nestjs/common'
import type { NextFunction, Request, Response } from 'express'
import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'

interface RequestContext {
  requestId: string
}

@Injectable()
export class RequestContextService implements NestMiddleware {
  private readonly storage = new AsyncLocalStorage<RequestContext>()

  use(request: Request, response: Response, next: NextFunction): void {
    const incoming = request.header('x-request-id')
    const requestId = incoming && /^[a-zA-Z0-9._-]{1,100}$/.test(incoming) ? incoming : randomUUID()
    response.setHeader('x-request-id', requestId)
    this.storage.run({ requestId }, next)
  }

  requestId(response?: Response): string {
    const responseId = response?.getHeader('x-request-id')
    return (
      this.storage.getStore()?.requestId ??
      (typeof responseId === 'string' ? responseId : undefined) ??
      'unscoped'
    )
  }
}
