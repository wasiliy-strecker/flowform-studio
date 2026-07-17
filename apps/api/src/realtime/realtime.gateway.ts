import type { RealtimeEvent } from '@flowform/realtime-contracts'
import { Injectable } from '@nestjs/common'
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets'
import { randomUUID } from 'node:crypto'
import type { Server, Socket } from 'socket.io'

import { SandboxService } from '../sandbox/sandbox.service'
import type { DemoSandbox, SandboxComment } from '../sandbox/sandbox.types'

@Injectable()
@WebSocketGateway({
  namespace: '/realtime',
  cors: { origin: process.env.PUBLIC_APP_URL ?? 'http://localhost:5173', credentials: true },
})
export class RealtimeGateway {
  @WebSocketServer()
  private readonly server: Server

  constructor(private readonly sandboxes: SandboxService) {}

  @SubscribeMessage('sandbox.join')
  join(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { sandboxId: string; accessToken: string },
  ): { joined: true; sandboxId: string } {
    this.sandboxes.assertAccess(body.sandboxId, body.accessToken)
    void client.join(this.room(body.sandboxId))
    return { joined: true, sandboxId: body.sandboxId }
  }

  @SubscribeMessage('typing.changed')
  typing(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    body: { sandboxId: string; accessToken: string; submissionId: string; typing: boolean },
  ): void {
    this.sandboxes.assertAccess(body.sandboxId, body.accessToken)
    const sandbox = this.sandboxes.get(body.sandboxId, body.accessToken)
    client.to(this.room(body.sandboxId)).emit('realtime.event', {
      id: randomUUID(),
      sandboxId: body.sandboxId,
      occurredAt: new Date().toISOString(),
      type: 'typing.changed',
      payload: {
        submissionId: body.submissionId,
        actorRole: sandbox.activeRole,
        typing: body.typing,
      },
    } satisfies RealtimeEvent)
  }

  emitComment(sandboxId: string, comment: SandboxComment): void {
    this.server?.to(this.room(sandboxId)).emit('realtime.event', {
      id: randomUUID(),
      sandboxId,
      occurredAt: comment.createdAt,
      type: 'comment.created',
      payload: {
        commentId: comment.id,
        submissionId: 'active',
        actorRole: comment.actorRole,
        message: comment.message,
        ...(comment.anchorFieldId ? { anchorFieldId: comment.anchorFieldId } : {}),
      },
    } satisfies RealtimeEvent)
  }

  emitStatus(sandboxId: string, sandbox: DemoSandbox): void {
    if (!sandbox.submission) return
    this.server?.to(this.room(sandboxId)).emit('realtime.event', {
      id: randomUUID(),
      sandboxId,
      occurredAt: new Date().toISOString(),
      type: 'submission.statusChanged',
      payload: {
        submissionId: sandbox.submission.id,
        status: sandbox.submission.workflowState.status,
      },
    } satisfies RealtimeEvent)
  }

  private room(sandboxId: string): string {
    return `sandbox:${sandboxId}`
  }
}
