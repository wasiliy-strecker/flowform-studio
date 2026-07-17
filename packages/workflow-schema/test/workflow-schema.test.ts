import { describe, expect, it } from 'vitest'

import {
  applyWorkflowAction,
  createExpenseApprovalWorkflow,
  startWorkflow,
  validateWorkflow,
} from '../src'

describe('workflow engine', () => {
  const definition = createExpenseApprovalWorkflow()
  const answers = { amount: 6_500 }

  it('validates the seeded approval workflow', () => {
    expect(validateWorkflow(definition)).toEqual([])
  })

  it('runs clarification and two approvals for a high-value request', () => {
    const started = startWorkflow(definition, answers, '2026-07-16T08:00:00.000Z', 'event-1')
    expect(started.currentNodeId).toBe('review')

    const clarification = applyWorkflowAction(
      definition,
      started,
      {
        type: 'requestClarification',
        actorRole: 'reviewer',
        at: '2026-07-16T08:05:00.000Z',
        id: 'event-2',
        message: 'Please add the expected delivery date.',
      },
      answers,
    )
    expect(clarification.status).toBe('needsClarification')

    const resubmitted = applyWorkflowAction(
      definition,
      clarification,
      {
        type: 'resubmit',
        actorRole: 'applicant',
        at: '2026-07-16T08:10:00.000Z',
        id: 'event-3',
      },
      answers,
    )
    const reviewed = applyWorkflowAction(
      definition,
      resubmitted,
      { type: 'approve', actorRole: 'reviewer', at: '2026-07-16T08:15:00.000Z', id: 'event-4' },
      answers,
    )
    expect(reviewed.currentNodeId).toBe('management')

    const approved = applyWorkflowAction(
      definition,
      reviewed,
      { type: 'approve', actorRole: 'management', at: '2026-07-16T08:20:00.000Z', id: 'event-5' },
      answers,
    )
    expect(approved.status).toBe('approved')
    expect(approved.history).toHaveLength(5)
  })

  it('skips management for a low-value request', () => {
    const started = startWorkflow(
      definition,
      { amount: 2_000 },
      '2026-07-16T08:00:00.000Z',
      'event-1',
    )
    const approved = applyWorkflowAction(
      definition,
      started,
      { type: 'approve', actorRole: 'reviewer', at: '2026-07-16T08:05:00.000Z', id: 'event-2' },
      { amount: 2_000 },
    )
    expect(approved.status).toBe('approved')
  })
})
