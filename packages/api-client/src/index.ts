import {
  ApiProblemSchema,
  HealthResponseSchema,
  SandboxContractSchema,
  SandboxSessionSchema,
  StoredAttachmentSchema,
  type ApiProblem,
  type HealthResponse,
  type SandboxContract,
  type SandboxSession,
  type StoredAttachment,
  type WorkflowActionInput,
} from '@flowform/api-contracts'
import type { ActorRole, FormAnswers, FormDefinition } from '@flowform/form-schema'
import type { WorkflowDefinition } from '@flowform/workflow-schema'
import type { z } from 'zod'

export type {
  ApiProblem,
  HealthResponse,
  SandboxContract,
  SandboxSession,
  StoredAttachment,
  WorkflowActionInput,
} from '@flowform/api-contracts'

export class FlowFormApiError extends Error {
  readonly problem: ApiProblem | undefined

  constructor(
    public readonly status: number,
    public readonly payload: unknown,
  ) {
    const parsed = ApiProblemSchema.safeParse(payload)
    super(
      parsed.success ? parsed.data.message : `FlowForm API request failed with status ${status}.`,
    )
    this.name = 'FlowFormApiError'
    this.problem = parsed.success ? parsed.data : undefined
  }

  get code(): string | undefined {
    return this.problem?.code
  }
}

export class FlowFormApiClient {
  constructor(
    readonly baseUrl = '/api/v1',
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  health(): Promise<HealthResponse> {
    return this.request(HealthResponseSchema, '/health')
  }

  readiness(): Promise<HealthResponse> {
    return this.request(HealthResponseSchema, '/health/ready')
  }

  createSandbox(): Promise<SandboxSession> {
    return this.request(SandboxSessionSchema, '/sandboxes', { method: 'POST' })
  }

  getSandbox(sandboxId: string, accessToken: string): Promise<SandboxContract> {
    return this.request(SandboxContractSchema, `/sandboxes/${sandboxId}`, {}, accessToken)
  }

  changeRole(sandboxId: string, accessToken: string, role: ActorRole): Promise<SandboxContract> {
    return this.request(
      SandboxContractSchema,
      `/sandboxes/${sandboxId}/role`,
      { method: 'PATCH', body: JSON.stringify({ role }) },
      accessToken,
    )
  }

  updateDraft(
    sandboxId: string,
    accessToken: string,
    expectedRevision: number,
    form: FormDefinition,
    workflow: WorkflowDefinition,
  ): Promise<SandboxContract> {
    return this.request(
      SandboxContractSchema,
      `/sandboxes/${sandboxId}/draft`,
      {
        method: 'PUT',
        body: JSON.stringify({ expectedRevision, form, workflow }),
      },
      accessToken,
    )
  }

  publish(
    sandboxId: string,
    accessToken: string,
    expectedRevision: number,
  ): Promise<SandboxContract> {
    return this.request(
      SandboxContractSchema,
      `/sandboxes/${sandboxId}/publish`,
      { method: 'POST', body: JSON.stringify({ expectedRevision }) },
      accessToken,
    )
  }

  submit(sandboxId: string, accessToken: string, answers: FormAnswers): Promise<SandboxContract> {
    return this.request(
      SandboxContractSchema,
      `/sandboxes/${sandboxId}/submissions`,
      { method: 'POST', body: JSON.stringify({ answers }) },
      accessToken,
    )
  }

  performWorkflowAction(
    sandboxId: string,
    accessToken: string,
    action: WorkflowActionInput,
  ): Promise<SandboxContract> {
    return this.request(
      SandboxContractSchema,
      `/sandboxes/${sandboxId}/workflow-actions`,
      { method: 'POST', body: JSON.stringify(action) },
      accessToken,
    )
  }

  addComment(
    sandboxId: string,
    accessToken: string,
    message: string,
    anchorFieldId?: string,
  ): Promise<SandboxContract> {
    return this.request(
      SandboxContractSchema,
      `/sandboxes/${sandboxId}/comments`,
      {
        method: 'POST',
        body: JSON.stringify({ message, ...(anchorFieldId ? { anchorFieldId } : {}) }),
      },
      accessToken,
    )
  }

  uploadAttachment(sandboxId: string, accessToken: string, file: File): Promise<StoredAttachment> {
    const body = new FormData()
    body.append('file', file)
    return this.request(
      StoredAttachmentSchema,
      `/sandboxes/${sandboxId}/attachments`,
      { method: 'POST', body },
      accessToken,
    )
  }

  realtimeOrigin(): string {
    if (this.baseUrl.startsWith('http://') || this.baseUrl.startsWith('https://')) {
      return new URL(this.baseUrl).origin
    }
    if (typeof window !== 'undefined') return window.location.origin
    return 'http://localhost:3000'
  }

  private async request<T>(
    schema: z.ZodType<T>,
    path: string,
    init: RequestInit = {},
    accessToken?: string,
  ): Promise<T> {
    const isFormData = typeof FormData !== 'undefined' && init.body instanceof FormData
    const response = await this.fetcher.call(globalThis, `${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init.body && !isFormData ? { 'Content-Type': 'application/json' } : {}),
        ...(accessToken ? { 'x-sandbox-token': accessToken } : {}),
        ...init.headers,
      },
    })
    const payload = await readPayload(response)
    if (!response.ok) throw new FlowFormApiError(response.status, payload)

    const parsed = schema.safeParse(payload)
    if (!parsed.success) {
      throw new FlowFormApiError(502, {
        status: 502,
        code: 'invalid_api_response',
        message: 'The FlowForm API returned an invalid response.',
        requestId: response.headers.get('x-request-id') ?? 'unknown',
        details: parsed.error.issues,
      })
    }
    return parsed.data
  }
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text()
  if (text.length === 0) return undefined
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}
