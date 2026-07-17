import {
  RealtimeEventSchema,
  RealtimeReadySchema,
  type RealtimeEvent,
} from '@flowform/realtime-contracts'
import { Inject, Logger } from '@nestjs/common'
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
} from '@nestjs/websockets'
import { randomUUID } from 'node:crypto'
import type { Server, Socket } from 'socket.io'
import { z } from 'zod'

import { SandboxService } from '../sandbox/sandbox.service'

const SocketAuthenticationSchema = z.object({
  sandboxId: z.string().min(1),
  accessToken: z.string().min(32),
})

const TypingInputSchema = z.object({
  submissionId: z.string().min(1),
  typing: z.boolean(),
})

@WebSocketGateway({
  namespace: '/realtime',
  cors: { origin: process.env.PUBLIC_APP_URL ?? 'http://localhost:5173', credentials: true },
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name)
  private readonly sessions = new Map<string, z.infer<typeof SocketAuthenticationSchema>>()

  @WebSocketServer()
  private server?: Server

  constructor(@Inject(SandboxService) private readonly sandboxes: SandboxService) {}

  async handleConnection(client: Socket): Promise<void> {
    const authentication = SocketAuthenticationSchema.safeParse(client.handshake.auth)
    if (!authentication.success) {
      client.disconnect(true)
      return
    }
    try {
      await this.sandboxes.assertAccess(
        authentication.data.sandboxId,
        authentication.data.accessToken,
      )
      this.sessions.set(client.id, authentication.data)
      await client.join(this.room(authentication.data.sandboxId))
      client.emit(
        'realtime.ready',
        RealtimeReadySchema.parse({
          sandboxId: authentication.data.sandboxId,
          connectedAt: new Date().toISOString(),
        }),
      )
    } catch (error) {
      this.sessions.delete(client.id)
      this.logger.warn({
        socketId: client.id,
        error: error instanceof Error ? error.message : String(error),
      })
      client.disconnect(true)
    }
  }

  handleDisconnect(client: Socket): void {
    this.sessions.delete(client.id)
  }

  @SubscribeMessage('typing.changed')
  async typing(@ConnectedSocket() client: Socket, @MessageBody() body: unknown): Promise<void> {
    const input = TypingInputSchema.safeParse(body)
    const session = this.sessions.get(client.id)
    if (!input.success || !session) return

    const sandbox = await this.sandboxes.get(session.sandboxId, session.accessToken)
    const event = RealtimeEventSchema.parse({
      id: randomUUID(),
      sandboxId: session.sandboxId,
      occurredAt: new Date().toISOString(),
      type: 'typing.changed',
      payload: {
        submissionId: input.data.submissionId,
        actorRole: sandbox.activeRole,
        typing: input.data.typing,
      },
    })
    client.to(this.room(session.sandboxId)).emit('realtime.event', event)
  }

  emitEvent(event: RealtimeEvent): void {
    this.server?.to(this.room(event.sandboxId)).emit('realtime.event', event)
  }

  private room(sandboxId: string): string {
    return `sandbox:${sandboxId}`
  }
}
