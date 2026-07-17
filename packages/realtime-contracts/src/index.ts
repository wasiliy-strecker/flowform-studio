import { ActorRoleSchema } from '@flowform/form-schema'
import { z } from 'zod'

const DurableEventBaseSchema = z.object({
  id: z.string().min(1),
  sandboxId: z.string().min(1),
  aggregateVersion: z.number().int().positive(),
  occurredAt: z.iso.datetime(),
})

const EphemeralEventBaseSchema = z.object({
  id: z.string().min(1),
  sandboxId: z.string().min(1),
  occurredAt: z.iso.datetime(),
})

export const RealtimeReadySchema = z.object({
  sandboxId: z.string().min(1),
  connectedAt: z.iso.datetime(),
})
export type RealtimeReady = z.infer<typeof RealtimeReadySchema>

export const sandboxChangeReasons = [
  'sandbox.created',
  'sandbox.roleChanged',
  'form.draftUpdated',
  'form.versionPublished',
  'submission.created',
  'workflow.actionApplied',
  'comment.created',
  'attachment.uploaded',
] as const

export const SandboxChangedEventSchema = DurableEventBaseSchema.extend({
  type: z.literal('sandbox.changed'),
  payload: z.object({
    reason: z.enum(sandboxChangeReasons),
  }),
})

export const TypingChangedEventSchema = EphemeralEventBaseSchema.extend({
  type: z.literal('typing.changed'),
  payload: z.object({
    submissionId: z.string().min(1),
    actorRole: ActorRoleSchema,
    typing: z.boolean(),
  }),
})

export const RealtimeEventSchema = z.discriminatedUnion('type', [
  SandboxChangedEventSchema,
  TypingChangedEventSchema,
])
export type RealtimeEvent = z.infer<typeof RealtimeEventSchema>
export type SandboxChangedEvent = z.infer<typeof SandboxChangedEventSchema>
