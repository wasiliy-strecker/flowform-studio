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
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  UnauthorizedException,
} from '@nestjs/common'
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'

import type {
  CreateSandboxResult,
  DemoSandbox,
  SandboxAuditEntry,
  SandboxComment,
  StoredSandbox,
} from './sandbox.types'

type WorkflowActionInput = WorkflowAction extends infer Action
  ? Action extends WorkflowAction
    ? Omit<Action, 'actorRole' | 'at' | 'id'>
    : never
  : never

@Injectable()
export class SandboxService implements OnModuleDestroy {
  private readonly sandboxes = new Map<string, StoredSandbox>()
  private readonly cleanupTimer: NodeJS.Timeout

  constructor() {
    this.cleanupTimer = setInterval(() => this.deleteExpired(), 60_000)
    this.cleanupTimer.unref()
  }

  onModuleDestroy(): void {
    clearInterval(this.cleanupTimer)
  }

  create(): CreateSandboxResult {
    const id = randomUUID()
    const accessToken = randomBytes(32).toString('base64url')
    const createdAt = new Date()
    const expiresAt = new Date(
      createdAt.getTime() + Number(process.env.SANDBOX_TTL_HOURS ?? 24) * 60 * 60 * 1_000,
    ).toISOString()
    const stored: StoredSandbox = {
      id,
      tokenHash: hashToken(accessToken),
      expiresAt,
      activeRole: 'designer',
      revision: 1,
      form: createExpenseRequestTemplate(),
      workflow: createExpenseApprovalWorkflow(),
      audit: [this.audit('sandbox.created', 'designer', id)],
    }
    this.sandboxes.set(id, stored)
    return { accessToken, sandbox: publicSandbox(stored) }
  }

  get(id: string, token: string | undefined): DemoSandbox {
    return publicSandbox(this.authorize(id, token))
  }

  assertAccess(id: string, token: string | undefined): void {
    this.authorize(id, token)
  }

  changeRole(id: string, token: string | undefined, roleInput: unknown): DemoSandbox {
    const sandbox = this.authorize(id, token)
    const role = ActorRoleSchema.parse(roleInput)
    sandbox.activeRole = role
    sandbox.audit.unshift(this.audit('sandbox.roleChanged', role, id))
    return publicSandbox(sandbox)
  }

  updateDraft(
    id: string,
    token: string | undefined,
    expectedRevision: number,
    formInput: FormDefinition,
    workflowInput: WorkflowDefinition,
  ): DemoSandbox {
    const sandbox = this.authorize(id, token)
    if (sandbox.activeRole !== 'designer') {
      throw new UnauthorizedException('Only the designer role can edit a draft.')
    }
    if (sandbox.revision !== expectedRevision) {
      throw new ConflictException({
        code: 'revision_conflict',
        expectedRevision,
        actualRevision: sandbox.revision,
      })
    }
    const form = FormDefinitionSchema.parse(formInput)
    const workflow = WorkflowDefinitionSchema.parse(workflowInput)
    const workflowIssues = validateWorkflow(workflow)
    if (workflowIssues.some((issue) => issue.code === 'cycle' || issue.code === 'dangling-edge')) {
      throw new BadRequestException({ code: 'invalid_workflow', issues: workflowIssues })
    }
    sandbox.form = form
    sandbox.workflow = workflow
    sandbox.revision += 1
    sandbox.audit.unshift(this.audit('form.draftUpdated', sandbox.activeRole, form.id))
    return publicSandbox(sandbox)
  }

  publish(id: string, token: string | undefined, expectedRevision: number): DemoSandbox {
    const sandbox = this.authorize(id, token)
    if (sandbox.activeRole !== 'designer') {
      throw new UnauthorizedException('Only the designer role can publish a form.')
    }
    if (sandbox.revision !== expectedRevision) {
      throw new ConflictException({
        code: 'revision_conflict',
        expectedRevision,
        actualRevision: sandbox.revision,
      })
    }
    const issues = validateWorkflow(sandbox.workflow)
    if (issues.length > 0) throw new BadRequestException({ code: 'invalid_workflow', issues })
    sandbox.publishedVersion = {
      version: (sandbox.publishedVersion?.version ?? 0) + 1,
      form: structuredClone(sandbox.form),
      workflow: structuredClone(sandbox.workflow),
      publishedAt: new Date().toISOString(),
    }
    sandbox.audit.unshift(this.audit('form.versionPublished', sandbox.activeRole, sandbox.form.id))
    return publicSandbox(sandbox)
  }

  submit(id: string, token: string | undefined, answers: FormAnswers): DemoSandbox {
    const sandbox = this.authorize(id, token)
    if (sandbox.activeRole !== 'applicant') {
      throw new UnauthorizedException('Only the applicant role can submit a form.')
    }
    if (!sandbox.publishedVersion)
      throw new BadRequestException('Publish the form before submitting it.')
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
    sandbox.audit.unshift(this.audit('submission.created', 'applicant', submissionId))
    return publicSandbox(sandbox)
  }

  performAction(id: string, token: string | undefined, action: WorkflowActionInput): DemoSandbox {
    const sandbox = this.authorize(id, token)
    const submission = sandbox.submission
    const published = sandbox.publishedVersion
    if (!submission || !published) throw new NotFoundException('No submission is active.')
    const fullAction = {
      ...action,
      actorRole: sandbox.activeRole,
      at: new Date().toISOString(),
      id: randomUUID(),
    } as WorkflowAction
    submission.workflowState = applyWorkflowAction(
      published.workflow,
      submission.workflowState,
      fullAction,
      submission.answers,
    )
    sandbox.audit.unshift(
      this.audit(`workflow.${fullAction.type}`, sandbox.activeRole, submission.id),
    )
    return publicSandbox(sandbox)
  }

  addComment(
    id: string,
    token: string | undefined,
    message: string,
    anchorFieldId?: string,
  ): { sandbox: DemoSandbox; comment: SandboxComment } {
    const sandbox = this.authorize(id, token)
    const submission = sandbox.submission
    if (!submission) throw new NotFoundException('No submission is active.')
    const comment: SandboxComment = {
      id: randomUUID(),
      actorRole: sandbox.activeRole,
      message,
      ...(anchorFieldId ? { anchorFieldId } : {}),
      createdAt: new Date().toISOString(),
    }
    submission.comments.push(comment)
    sandbox.audit.unshift(this.audit('comment.created', sandbox.activeRole, comment.id))
    return { sandbox: publicSandbox(sandbox), comment }
  }

  recordAttachment(id: string, token: string | undefined, attachmentId: string): void {
    const sandbox = this.authorize(id, token)
    sandbox.audit.unshift(this.audit('attachment.uploaded', sandbox.activeRole, attachmentId))
  }

  private authorize(id: string, token: string | undefined): StoredSandbox {
    const sandbox = this.sandboxes.get(id)
    if (!sandbox) throw new NotFoundException('Sandbox not found.')
    if (Date.parse(sandbox.expiresAt) <= Date.now()) {
      this.sandboxes.delete(id)
      throw new GoneException('This sandbox has expired.')
    }
    if (!token || !tokensMatch(token, sandbox.tokenHash)) {
      throw new UnauthorizedException('A valid sandbox token is required.')
    }
    return sandbox
  }

  private audit(action: string, actorRole: ActorRole, targetId: string): SandboxAuditEntry {
    return { id: randomUUID(), action, actorRole, targetId, occurredAt: new Date().toISOString() }
  }

  private deleteExpired(): void {
    const current = Date.now()
    for (const [id, sandbox] of this.sandboxes) {
      if (Date.parse(sandbox.expiresAt) <= current) this.sandboxes.delete(id)
    }
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
  const { tokenHash: _tokenHash, ...sandbox } = stored
  return structuredClone(sandbox)
}
