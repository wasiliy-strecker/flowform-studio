import { ActorRoleSchema, FormDefinitionSchema, type FormAnswers } from '@flowform/form-schema'
import { WorkflowDefinitionSchema, WorkflowStateSchema } from '@flowform/workflow-schema'
import { z } from 'zod'

export const HealthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  service: z.string().min(1),
  version: z.string().min(1),
  now: z.iso.datetime(),
  checks: z
    .object({
      database: z.enum(['up', 'down', 'not-configured']),
      objectStorage: z.enum(['up', 'down', 'memory']),
    })
    .optional(),
})
export type HealthResponse = z.infer<typeof HealthResponseSchema>

export const SandboxCommentSchema = z.object({
  id: z.string().min(1),
  actorRole: ActorRoleSchema,
  message: z.string().min(1),
  anchorFieldId: z.string().optional(),
  createdAt: z.iso.datetime(),
})
export type SandboxComment = z.infer<typeof SandboxCommentSchema>

export const SandboxAuditEntrySchema = z.object({
  id: z.string().min(1),
  actorRole: ActorRoleSchema,
  action: z.string().min(1),
  targetId: z.string().min(1),
  occurredAt: z.iso.datetime(),
})
export type SandboxAuditEntry = z.infer<typeof SandboxAuditEntrySchema>

export const StoredAttachmentSchema = z.object({
  id: z.string().min(1),
  objectKey: z.string().min(1),
  originalName: z.string().min(1),
  mediaType: z.enum(['application/pdf', 'image/png', 'image/jpeg']),
  sizeBytes: z.number().int().nonnegative(),
  checksumSha256: z.string().regex(/^[a-f0-9]{64}$/),
  storage: z.enum(['memory', 'minio']),
  createdAt: z.iso.datetime(),
})
export type StoredAttachment = z.infer<typeof StoredAttachmentSchema>

export const SandboxSubmissionSchema = z.object({
  id: z.string().min(1),
  formVersion: z.number().int().positive(),
  answers: z.record(z.string(), z.unknown()),
  workflowState: WorkflowStateSchema,
  comments: z.array(SandboxCommentSchema),
  createdAt: z.iso.datetime(),
})
export type SandboxSubmission = Omit<z.infer<typeof SandboxSubmissionSchema>, 'answers'> & {
  answers: FormAnswers
}

export const PublishedFormVersionSchema = z.object({
  version: z.number().int().positive(),
  draftRevision: z.number().int().positive(),
  form: FormDefinitionSchema,
  workflow: WorkflowDefinitionSchema,
  publishedAt: z.iso.datetime(),
})
export type PublishedFormVersion = z.infer<typeof PublishedFormVersionSchema>

export const SandboxContractSchema = z.object({
  id: z.string().min(1),
  expiresAt: z.iso.datetime(),
  activeRole: ActorRoleSchema,
  revision: z.number().int().positive(),
  form: FormDefinitionSchema,
  workflow: WorkflowDefinitionSchema,
  publishedVersion: PublishedFormVersionSchema.optional(),
  submission: SandboxSubmissionSchema.optional(),
  attachments: z.array(StoredAttachmentSchema),
  audit: z.array(SandboxAuditEntrySchema),
})
export type SandboxContract = z.infer<typeof SandboxContractSchema>

export const SandboxSessionSchema = z.object({
  accessToken: z.string().min(32),
  sandbox: SandboxContractSchema,
})
export type SandboxSession = z.infer<typeof SandboxSessionSchema>

export const ApiProblemSchema = z.object({
  status: z.number().int(),
  code: z.string().min(1),
  message: z.string().min(1),
  requestId: z.string().min(1),
  details: z.unknown().optional(),
})
export type ApiProblem = z.infer<typeof ApiProblemSchema>

export const RevisionConflictDetailsSchema = z.object({
  expectedRevision: z.number().int().positive(),
  actualRevision: z.number().int().positive(),
})
export type RevisionConflictDetails = z.infer<typeof RevisionConflictDetailsSchema>

export const workflowActionTypes = [
  'approve',
  'requestClarification',
  'resubmit',
  'reject',
] as const

export const WorkflowActionInputSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('approve') }),
  z.object({ type: z.literal('requestClarification'), message: z.string().min(1).max(2_000) }),
  z.object({ type: z.literal('resubmit'), message: z.string().min(1).max(2_000).optional() }),
  z.object({ type: z.literal('reject'), message: z.string().min(1).max(2_000).optional() }),
])
export type WorkflowActionInput = z.infer<typeof WorkflowActionInputSchema>
