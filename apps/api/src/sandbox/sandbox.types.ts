import type { ActorRole, FormAnswers, FormDefinition } from '@flowform/form-schema'
import type { WorkflowDefinition, WorkflowState } from '@flowform/workflow-schema'

export interface SandboxComment {
  id: string
  actorRole: ActorRole
  message: string
  anchorFieldId?: string
  createdAt: string
}

export interface SandboxAuditEntry {
  id: string
  actorRole: ActorRole
  action: string
  targetId: string
  occurredAt: string
}

export interface SandboxSubmission {
  id: string
  formVersion: number
  answers: FormAnswers
  workflowState: WorkflowState
  comments: SandboxComment[]
  createdAt: string
}

export interface DemoSandbox {
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
  submission?: SandboxSubmission
  audit: SandboxAuditEntry[]
}

export interface StoredSandbox extends DemoSandbox {
  tokenHash: string
}

export interface CreateSandboxResult {
  accessToken: string
  sandbox: DemoSandbox
}
