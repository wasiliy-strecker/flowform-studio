import { ActorRoleSchema } from '@flowform/form-schema'
import { z } from 'zod'

const EventBaseSchema = z.object({
  id: z.string().min(1),
  sandboxId: z.string().min(1),
  occurredAt: z.iso.datetime(),
})

export const CommentCreatedEventSchema = EventBaseSchema.extend({
  type: z.literal('comment.created'),
  payload: z.object({
    commentId: z.string().min(1),
    submissionId: z.string().min(1),
    actorRole: ActorRoleSchema,
    message: z.string().min(1),
    anchorFieldId: z.string().optional(),
  }),
})

export const TypingChangedEventSchema = EventBaseSchema.extend({
  type: z.literal('typing.changed'),
  payload: z.object({
    submissionId: z.string().min(1),
    actorRole: ActorRoleSchema,
    typing: z.boolean(),
  }),
})

export const SubmissionStatusChangedEventSchema = EventBaseSchema.extend({
  type: z.literal('submission.statusChanged'),
  payload: z.object({
    submissionId: z.string().min(1),
    status: z.enum(['draft', 'inReview', 'needsClarification', 'approved', 'rejected']),
  }),
})

export const RealtimeEventSchema = z.discriminatedUnion('type', [
  CommentCreatedEventSchema,
  TypingChangedEventSchema,
  SubmissionStatusChangedEventSchema,
])
export type RealtimeEvent = z.infer<typeof RealtimeEventSchema>
