import {
  type SandboxAuditEntry,
  type SandboxComment,
  type StoredAttachment,
  type WorkflowActionInput,
} from '@flowform/api-contracts'
import {
  ActorRoleSchema,
  FormDefinitionSchema,
  createExpenseRequestTemplate,
  validateAnswers,
  type ActorRole,
  type FormAnswers,
  type FormDefinition,
} from '@flowform/form-schema'
import {
  WorkflowDefinitionSchema,
  applyWorkflowAction,
  createExpenseApprovalWorkflow,
  startWorkflow,
  validateWorkflow,
  type WorkflowAction,
  type WorkflowDefinition,
} from '@flowform/workflow-schema'
import {
  BadRequestException,
  ConflictException,
  GoneException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common'
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'

import type { CreateSandboxResult, DemoSandbox } from './sandbox.types'
import {
  SANDBOX_REPOSITORY,
  type SandboxRepository,
  type StoredSandbox,
} from './sandbox.repository'

interface MutationMetadata {
  action: string
  actorRole: ActorRole
  targetId: string
  reason:
    | 'sandbox.roleChanged'
    | 'form.draftUpdated'
    | 'form.versionPublished'
    | 'submission.created'
    | 'workflow.actionApplied'
    | 'comment.created'
    | 'attachment.uploaded'
  attachment?: StoredAttachment
}

@Injectable()
export class SandboxService {
  constructor(
    @Inject(SANDBOX_REPOSITORY)
    private readonly repository: SandboxRepository,
  ) {}

  async create(): Promise<CreateSandboxResult> {
    const id = randomUUID()
    const accessToken = randomBytes(32).toString('base64url')
    const createdAt = new Date()
    const ttlHours = positiveNumber(process.env.SANDBOX_TTL_HOURS, 24)
    const expiresAt = new Date(createdAt.getTime() + ttlHours * 60 * 60 * 1_000).toISOString()
    const initialAudit = this.audit('sandbox.created', 'designer', id, createdAt)
    const stored: StoredSandbox = {
      id,
      tokenHash: hashToken(accessToken),
      expiresAt,
      activeRole: 'designer',
      revision: 1,
      aggregateVersion: 1,
      form: createExpenseRequestTemplate(),
      workflow: createExpenseApprovalWorkflow(),
      attachments: [],
      audit: [initialAudit],
    }
    await this.repository.create(stored, this.event(stored, 'sandbox.created', createdAt))
    return { accessToken, sandbox: publicSandbox(stored) }
  }

  async get(id: string, token: string | undefined): Promise<DemoSandbox> {
    return publicSandbox(await this.authorize(id, token))
  }

  async assertAccess(id: string, token: string | undefined): Promise<void> {
    await this.authorize(id, token)
  }

  async changeRole(
    id: string,
    token: string | undefined,
    roleInput: unknown,
  ): Promise<DemoSandbox> {
    const role = ActorRoleSchema.parse(roleInput)
    return this.mutate(id, token, (sandbox) => {
      sandbox.activeRole = role
      return {
        action: 'sandbox.roleChanged',
        actorRole: role,
        targetId: id,
        reason: 'sandbox.roleChanged',
      }
    })
  }

  async updateDraft(
    id: string,
    token: string | undefined,
    expectedRevision: number,
    formInput: FormDefinition,
    workflowInput: WorkflowDefinition,
  ): Promise<DemoSandbox> {
    return this.mutate(id, token, (sandbox) => {
      this.requireDesigner(sandbox)
      this.requireRevision(sandbox, expectedRevision)
      const form = FormDefinitionSchema.parse(formInput)
      const workflow = WorkflowDefinitionSchema.parse(workflowInput)
      const workflowIssues = validateWorkflow(workflow)
      if (
        workflowIssues.some((issue) => issue.code === 'cycle' || issue.code === 'dangling-edge')
      ) {
        throw new BadRequestException({ code: 'invalid_workflow', issues: workflowIssues })
      }
      sandbox.form = form
      sandbox.workflow = workflow
      sandbox.revision += 1
      return {
        action: 'form.draftUpdated',
        actorRole: sandbox.activeRole,
        targetId: form.id,
        reason: 'form.draftUpdated',
      }
    })
  }

  async publish(
    id: string,
    token: string | undefined,
    expectedRevision: number,
  ): Promise<DemoSandbox> {
    return this.mutate(id, token, (sandbox) => {
      this.requireDesigner(sandbox)
      this.requireRevision(sandbox, expectedRevision)
      const issues = validateWorkflow(sandbox.workflow)
      if (issues.length > 0) {
        throw new BadRequestException({ code: 'invalid_workflow', issues })
      }
      sandbox.publishedVersion = {
        version: (sandbox.publishedVersion?.version ?? 0) + 1,
        draftRevision: sandbox.revision,
        form: structuredClone(sandbox.form),
        workflow: structuredClone(sandbox.workflow),
        publishedAt: new Date().toISOString(),
      }
      return {
        action: 'form.versionPublished',
        actorRole: sandbox.activeRole,
        targetId: sandbox.form.id,
        reason: 'form.versionPublished',
      }
    })
  }

  async submit(id: string, token: string | undefined, answers: FormAnswers): Promise<DemoSandbox> {
    return this.mutate(id, token, (sandbox) => {
      if (sandbox.activeRole !== 'applicant') {
        throw new UnauthorizedException('Only the applicant role can submit a form.')
      }
      if (!sandbox.publishedVersion) {
        throw new BadRequestException('Publish the form before submitting it.')
      }
      if (sandbox.submission) {
        throw new ConflictException({
          code: 'submission_exists',
          message: 'This sandbox already contains a submission.',
        })
      }
      const errors = validateAnswers(sandbox.publishedVersion.form, answers)
      if (Object.keys(errors).length > 0) {
        throw new BadRequestException({ code: 'invalid_answers', errors })
      }
      const submissionId = randomUUID()
      const createdAt = new Date().toISOString()
      sandbox.submission = {
        id: submissionId,
        formVersion: sandbox.publishedVersion.version,
        answers: structuredClone(answers),
        workflowState: startWorkflow(
          sandbox.publishedVersion.workflow,
          answers,
          createdAt,
          randomUUID(),
        ),
        comments: [],
        createdAt,
      }
      return {
        action: 'submission.created',
        actorRole: 'applicant',
        targetId: submissionId,
        reason: 'submission.created',
      }
    })
  }

  async performAction(
    id: string,
    token: string | undefined,
    action: WorkflowActionInput,
  ): Promise<DemoSandbox> {
    return this.mutate(id, token, (sandbox) => {
      const submission = sandbox.submission
      const published = sandbox.publishedVersion
      if (!submission || !published) throw new NotFoundException('No submission is active.')
      const occurredAt = new Date().toISOString()
      const fullAction = toWorkflowAction(action, sandbox.activeRole, occurredAt)
      try {
        submission.workflowState = applyWorkflowAction(
          published.workflow,
          submission.workflowState,
          fullAction,
          submission.answers,
        )
      } catch (error) {
        throw new ConflictException({
          code: 'invalid_workflow_action',
          message: error instanceof Error ? error.message : 'The workflow action is not allowed.',
        })
      }
      if ('message' in fullAction && fullAction.message) {
        submission.comments.push(
          this.comment(sandbox.activeRole, fullAction.message, occurredAt, 'justification'),
        )
      }
      return {
        action: `workflow.${fullAction.type}`,
        actorRole: sandbox.activeRole,
        targetId: submission.id,
        reason: 'workflow.actionApplied',
      }
    })
  }

  async addComment(
    id: string,
    token: string | undefined,
    message: string,
    anchorFieldId?: string,
  ): Promise<DemoSandbox> {
    return this.mutate(id, token, (sandbox) => {
      if (!sandbox.submission) throw new NotFoundException('No submission is active.')
      const comment = this.comment(
        sandbox.activeRole,
        message,
        new Date().toISOString(),
        anchorFieldId,
      )
      sandbox.submission.comments.push(comment)
      return {
        action: 'comment.created',
        actorRole: sandbox.activeRole,
        targetId: comment.id,
        reason: 'comment.created',
      }
    })
  }

  async recordAttachment(
    id: string,
    token: string | undefined,
    attachment: StoredAttachment,
  ): Promise<DemoSandbox> {
    return this.mutate(id, token, (sandbox) => {
      if (sandbox.attachments.some((candidate) => candidate.id === attachment.id)) {
        throw new ConflictException({
          code: 'attachment_exists',
          message: 'This attachment has already been recorded.',
        })
      }
      sandbox.attachments.push(attachment)
      return {
        action: 'attachment.uploaded',
        actorRole: sandbox.activeRole,
        targetId: attachment.id,
        reason: 'attachment.uploaded',
        attachment,
      }
    })
  }

  repositoryKind(): SandboxRepository['kind'] {
    return this.repository.kind
  }

  async health(): Promise<void> {
    await this.repository.health()
  }

  private async mutate(
    id: string,
    token: string | undefined,
    transform: (sandbox: StoredSandbox) => MutationMetadata,
  ): Promise<DemoSandbox> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const current = await this.authorize(id, token)
      const next = structuredClone(current)
      const metadata = transform(next)
      const occurredAt = new Date()
      const auditEntry = this.audit(
        metadata.action,
        metadata.actorRole,
        metadata.targetId,
        occurredAt,
      )
      next.aggregateVersion = current.aggregateVersion + 1
      next.audit = [auditEntry, ...current.audit]
      const event = this.event(next, metadata.reason, occurredAt)
      const saved = await this.repository.save({
        sandbox: next,
        expectedAggregateVersion: current.aggregateVersion,
        auditEntry,
        event,
        ...(metadata.attachment ? { attachment: metadata.attachment } : {}),
      })
      if (saved) return publicSandbox(next)
    }
    throw new ConflictException({
      code: 'aggregate_busy',
      message: 'The sandbox changed concurrently. Reload it and try again.',
    })
  }

  private async authorize(id: string, token: string | undefined): Promise<StoredSandbox> {
    const sandbox = await this.repository.find(id)
    if (!sandbox) throw new NotFoundException('Sandbox not found.')
    if (Date.parse(sandbox.expiresAt) <= Date.now()) {
      throw new GoneException('This sandbox has expired.')
    }
    if (!token || !tokensMatch(token, sandbox.tokenHash)) {
      throw new UnauthorizedException('A valid sandbox token is required.')
    }
    return sandbox
  }

  private requireDesigner(sandbox: StoredSandbox): void {
    if (sandbox.activeRole !== 'designer') {
      throw new UnauthorizedException('Only the designer role can edit or publish a draft.')
    }
  }

  private requireRevision(sandbox: StoredSandbox, expectedRevision: number): void {
    if (sandbox.revision !== expectedRevision) {
      throw new ConflictException({
        code: 'revision_conflict',
        expectedRevision,
        actualRevision: sandbox.revision,
      })
    }
  }

  private audit(
    action: string,
    actorRole: ActorRole,
    targetId: string,
    occurredAt: Date,
  ): SandboxAuditEntry {
    return {
      id: randomUUID(),
      action,
      actorRole,
      targetId,
      occurredAt: occurredAt.toISOString(),
    }
  }

  private event(
    sandbox: StoredSandbox,
    reason:
      | 'sandbox.created'
      | 'sandbox.roleChanged'
      | 'form.draftUpdated'
      | 'form.versionPublished'
      | 'submission.created'
      | 'workflow.actionApplied'
      | 'comment.created'
      | 'attachment.uploaded',
    occurredAt: Date,
  ) {
    return {
      id: randomUUID(),
      sandboxId: sandbox.id,
      aggregateVersion: sandbox.aggregateVersion,
      occurredAt: occurredAt.toISOString(),
      type: 'sandbox.changed' as const,
      payload: { reason },
    }
  }

  private comment(
    actorRole: ActorRole,
    message: string,
    createdAt: string,
    anchorFieldId?: string,
  ): SandboxComment {
    return {
      id: randomUUID(),
      actorRole,
      message,
      createdAt,
      ...(anchorFieldId ? { anchorFieldId } : {}),
    }
  }
}

function toWorkflowAction(
  action: WorkflowActionInput,
  actorRole: ActorRole,
  at: string,
): WorkflowAction {
  const common = { actorRole, at, id: randomUUID() }
  switch (action.type) {
    case 'approve':
      return { ...common, type: 'approve' }
    case 'requestClarification':
      return { ...common, type: 'requestClarification', message: action.message }
    case 'resubmit':
      return action.message
        ? { ...common, type: 'resubmit', message: action.message }
        : { ...common, type: 'resubmit' }
    case 'reject':
      return action.message
        ? { ...common, type: 'reject', message: action.message }
        : { ...common, type: 'reject' }
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function tokensMatch(token: string, storedHash: string): boolean {
  const candidate = Buffer.from(hashToken(token), 'hex')
  const stored = Buffer.from(storedHash, 'hex')
  return candidate.length === stored.length && timingSafeEqual(candidate, stored)
}

function publicSandbox(stored: StoredSandbox): DemoSandbox {
  const { tokenHash: _tokenHash, aggregateVersion: _aggregateVersion, ...sandbox } = stored
  return structuredClone(sandbox)
}

function positiveNumber(input: string | undefined, fallback: number): number {
  const parsed = Number(input ?? fallback)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}
