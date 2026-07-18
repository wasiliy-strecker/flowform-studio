import {
  ApiProblemSchema,
  PublishedFormVersionListSchema,
  PublishedFormVersionSchema,
  SandboxContractSchema,
  SandboxSessionSchema,
  type SandboxContract,
} from '@flowform/api-contracts'
import {
  RealtimeEventSchema,
  RealtimeReadySchema,
  type SandboxChangedEvent,
} from '@flowform/realtime-contracts'
import type { INestApplication } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { io, type Socket } from 'socket.io-client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { AppModule } from '../src/app.module'

describe('FlowForm API vertical slice', () => {
  let app: INestApplication
  let apiOrigin: string
  let apiUrl: string

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false })
    app.setGlobalPrefix('api/v1')
    await app.listen(0, '127.0.0.1')
    const server: unknown = app.getHttpServer()
    apiOrigin = `http://127.0.0.1:${listeningPort(server)}`
    apiUrl = `${apiOrigin}/api/v1`
  })

  afterAll(async () => {
    await app.close()
  })

  it('persists a revision-safe form through clarification and two approvals', async () => {
    const createResponse = await fetch(`${apiUrl}/sandboxes`, { method: 'POST' })
    expect(createResponse.status).toBe(201)
    const session = SandboxSessionSchema.parse(await createResponse.json())
    const { accessToken } = session
    let sandbox = session.sandbox

    const unauthorizedResponse = await fetch(`${apiUrl}/sandboxes/${sandbox.id}`, {
      headers: { 'x-request-id': 'flowform-api-e2e' },
    })
    expect(unauthorizedResponse.status).toBe(401)
    expect(unauthorizedResponse.headers.get('x-request-id')).toBe('flowform-api-e2e')
    const unauthorized = ApiProblemSchema.parse(await unauthorizedResponse.json())
    expect(unauthorized).toMatchObject({
      code: 'unauthorized',
      requestId: 'flowform-api-e2e',
    })

    sandbox = await mutate(sandbox, accessToken, 'PUT', 'draft', {
      expectedRevision: sandbox.revision,
      form: {
        ...sandbox.form,
        description: 'Saved by the HTTP integration test.',
      },
      workflow: sandbox.workflow,
    })
    expect(sandbox.revision).toBe(2)

    const conflictResponse = await fetch(`${apiUrl}/sandboxes/${sandbox.id}/draft`, {
      method: 'PUT',
      headers: jsonHeaders(accessToken),
      body: JSON.stringify({
        expectedRevision: 1,
        form: sandbox.form,
        workflow: sandbox.workflow,
      }),
    })
    expect(conflictResponse.status).toBe(409)
    const conflict = ApiProblemSchema.parse(await conflictResponse.json())
    expect(conflict).toMatchObject({
      code: 'revision_conflict',
      details: { expectedRevision: 1, actualRevision: 2 },
    })

    sandbox = await mutate(sandbox, accessToken, 'POST', 'publish', {
      expectedRevision: sandbox.revision,
    })
    expect(sandbox.publishedVersion?.draftRevision).toBe(2)
    expect(sandbox.publishedVersionCount).toBe(1)

    const publishAuditCount = sandbox.audit.filter(
      (entry) => entry.action === 'form.versionPublished',
    ).length
    sandbox = await mutate(sandbox, accessToken, 'POST', 'publish', {
      expectedRevision: sandbox.revision,
    })
    expect(sandbox.publishedVersionCount).toBe(1)
    expect(sandbox.audit.filter((entry) => entry.action === 'form.versionPublished')).toHaveLength(
      publishAuditCount,
    )

    const versionsResponse = await fetch(`${apiUrl}/sandboxes/${sandbox.id}/versions`, {
      headers: { 'x-sandbox-token': accessToken },
    })
    expect(versionsResponse.status).toBe(200)
    expect(PublishedFormVersionListSchema.parse(await versionsResponse.json())).toEqual([
      expect.objectContaining({ version: 1, draftRevision: 2 }),
    ])

    const versionResponse = await fetch(`${apiUrl}/sandboxes/${sandbox.id}/versions/1`, {
      headers: { 'x-sandbox-token': accessToken },
    })
    expect(versionResponse.status).toBe(200)
    expect(PublishedFormVersionSchema.parse(await versionResponse.json())).toMatchObject({
      version: 1,
      draftRevision: 2,
    })

    const socket = io(`${apiOrigin}/realtime`, {
      auth: { sandboxId: sandbox.id, accessToken },
      forceNew: true,
      transports: ['websocket'],
    })
    await waitForRealtimeReady(socket, sandbox.id)
    const roleChanged = waitForSandboxChange(socket, 'sandbox.roleChanged')
    sandbox = await changeRole(sandbox, accessToken, 'applicant')
    await expect(roleChanged).resolves.toMatchObject({
      sandboxId: sandbox.id,
      payload: { reason: 'sandbox.roleChanged' },
    })
    socket.close()

    sandbox = await mutate(sandbox, accessToken, 'POST', 'submissions', {
      answers: validAnswers,
    })
    expect(sandbox.submission?.workflowState.currentNodeId).toBe('review')

    sandbox = await changeRole(sandbox, accessToken, 'reviewer')
    sandbox = await mutate(sandbox, accessToken, 'POST', 'workflow-actions', {
      type: 'requestClarification',
      message: 'Please confirm the delivery date.',
    })
    expect(sandbox.submission?.workflowState.status).toBe('needsClarification')

    sandbox = await changeRole(sandbox, accessToken, 'applicant')
    sandbox = await mutate(sandbox, accessToken, 'POST', 'workflow-actions', {
      type: 'resubmit',
      message: 'Delivery is expected on 15 September.',
    })

    sandbox = await changeRole(sandbox, accessToken, 'reviewer')
    sandbox = await mutate(sandbox, accessToken, 'POST', 'workflow-actions', {
      type: 'approve',
    })
    expect(sandbox.submission?.workflowState.currentNodeId).toBe('management')

    sandbox = await changeRole(sandbox, accessToken, 'management')
    sandbox = await mutate(sandbox, accessToken, 'POST', 'workflow-actions', {
      type: 'approve',
    })

    expect(sandbox.submission?.workflowState.status).toBe('approved')
    expect(sandbox.submission?.comments).toHaveLength(2)
    expect(sandbox.audit.map((entry) => entry.action)).toEqual(
      expect.arrayContaining([
        'form.draftUpdated',
        'form.versionPublished',
        'submission.created',
        'workflow.requestClarification',
        'workflow.resubmit',
        'workflow.approve',
      ]),
    )
  }, 15_000)

  async function changeRole(
    sandbox: SandboxContract,
    accessToken: string,
    role: SandboxContract['activeRole'],
  ): Promise<SandboxContract> {
    return mutate(sandbox, accessToken, 'PATCH', 'role', { role })
  }

  async function mutate(
    sandbox: SandboxContract,
    accessToken: string,
    method: 'PATCH' | 'POST' | 'PUT',
    path: string,
    body: unknown,
  ): Promise<SandboxContract> {
    const response = await fetch(`${apiUrl}/sandboxes/${sandbox.id}/${path}`, {
      method,
      headers: jsonHeaders(accessToken),
      body: JSON.stringify(body),
    })
    expect(response.status, `${method} ${path}`).toBeLessThan(300)
    return SandboxContractSchema.parse(await response.json())
  }
})

function jsonHeaders(accessToken: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-sandbox-token': accessToken,
  }
}

const validAnswers = {
  applicantName: 'Alex Morgan',
  applicantEmail: 'alex.morgan@example.com',
  amount: 6_500,
  category: 'equipment',
  justification: 'Replace two outdated design workstations used by the product team.',
  confirmation: true,
  signature: 'integration-test-confirmation',
}

function listeningPort(server: unknown): number {
  if (!hasAddress(server)) {
    throw new Error('The Nest HTTP server is not listening.')
  }
  const address: unknown = server.address()
  if (
    typeof address !== 'object' ||
    address === null ||
    !('port' in address) ||
    typeof address.port !== 'number'
  ) {
    throw new Error('The Nest HTTP server did not expose a TCP port.')
  }
  return address.port
}

function hasAddress(value: unknown): value is { address: () => unknown } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'address' in value &&
    typeof value.address === 'function'
  )
}

function waitForRealtimeReady(socket: Socket, sandboxId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup()
      reject(new Error('Timed out while authenticating the realtime connection.'))
    }, 5_000)
    const ready = (input: unknown): void => {
      const parsed = RealtimeReadySchema.safeParse(input)
      if (!parsed.success || parsed.data.sandboxId !== sandboxId) return
      cleanup()
      resolve()
    }
    const failed = (error: Error): void => {
      cleanup()
      reject(error)
    }
    const cleanup = (): void => {
      clearTimeout(timeout)
      socket.off('realtime.ready', ready)
      socket.off('connect_error', failed)
    }
    socket.on('realtime.ready', ready)
    socket.on('connect_error', failed)
  })
}

function waitForSandboxChange(
  socket: Socket,
  reason: SandboxChangedEvent['payload']['reason'],
): Promise<SandboxChangedEvent> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup()
      reject(new Error(`Timed out waiting for ${reason}.`))
    }, 5_000)
    const changed = (input: unknown): void => {
      const parsed = RealtimeEventSchema.safeParse(input)
      if (
        !parsed.success ||
        parsed.data.type !== 'sandbox.changed' ||
        parsed.data.payload.reason !== reason
      ) {
        return
      }
      cleanup()
      resolve(parsed.data)
    }
    const cleanup = (): void => {
      clearTimeout(timeout)
      socket.off('realtime.event', changed)
    }
    socket.on('realtime.event', changed)
  })
}
