import type { ActorRole, FormAnswers, FormDefinition } from '@flowform/form-schema'
import type { WorkflowDefinition, WorkflowState } from '@flowform/workflow-schema'

export interface HealthResponse {
  status: 'ok'
  service: string
  version: string
  now: string
}

export interface SandboxContract {
  id: string
  expiresAt: string
  activeRole: ActorRole
  revision: number
  form: FormDefinition
  workflow: WorkflowDefinition
  publishedVersion?: {
    version: number
    form: FormDefinition
    workflow: WorkflowDefinition
    publishedAt: string
  }
  submission?: {
    id: string
    formVersion: number
    answers: FormAnswers
    workflowState: WorkflowState
    createdAt: string
  }
}

export interface SandboxSession {
  accessToken: string
  sandbox: SandboxContract
}

export class FlowFormApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly payload: unknown,
  ) {
    super(`FlowForm API request failed with status ${status}.`)
  }
}

export class FlowFormApiClient {
  constructor(
    private readonly baseUrl = '/api/v1',
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  health(): Promise<HealthResponse> {
    return this.request<HealthResponse>('/health')
  }

  createSandbox(): Promise<SandboxSession> {
    return this.request<SandboxSession>('/sandboxes', { method: 'POST' })
  }

  getSandbox(sandboxId: string, accessToken: string): Promise<SandboxContract> {
    return this.request<SandboxContract>(`/sandboxes/${sandboxId}`, {}, accessToken)
  }

  changeRole(sandboxId: string, accessToken: string, role: ActorRole): Promise<SandboxContract> {
    return this.request<SandboxContract>(
      `/sandboxes/${sandboxId}/role`,
      { method: 'PATCH', body: JSON.stringify({ role }) },
      accessToken,
    )
  }

  publish(
    sandboxId: string,
    accessToken: string,
    expectedRevision: number,
  ): Promise<SandboxContract> {
    return this.request<SandboxContract>(
      `/sandboxes/${sandboxId}/publish`,
      { method: 'POST', body: JSON.stringify({ expectedRevision }) },
      accessToken,
    )
  }

  submit(sandboxId: string, accessToken: string, answers: FormAnswers): Promise<SandboxContract> {
    return this.request<SandboxContract>(
      `/sandboxes/${sandboxId}/submissions`,
      { method: 'POST', body: JSON.stringify({ answers }) },
      accessToken,
    )
  }

  private async request<T>(path: string, init: RequestInit = {}, accessToken?: string): Promise<T> {
    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(accessToken ? { 'x-sandbox-token': accessToken } : {}),
        ...init.headers,
      },
    })
    const payload: unknown = await response.json()
    if (!response.ok) throw new FlowFormApiError(response.status, payload)
    return payload as T
  }
}
