import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { SandboxService } from '../src/sandbox/sandbox.service'

describe('SandboxService', () => {
  let service: SandboxService

  beforeEach(() => {
    service = new SandboxService()
  })

  afterEach(() => service.onModuleDestroy())

  it('creates a protected sandbox and rejects an invalid token', () => {
    const created = service.create()
    expect(created.sandbox.form.pages).toHaveLength(2)
    expect(() => service.get(created.sandbox.id, 'wrong-token')).toThrow(UnauthorizedException)
    expect(service.get(created.sandbox.id, created.accessToken).id).toBe(created.sandbox.id)
  })

  it('enforces optimistic revision checks', () => {
    const created = service.create()
    expect(() =>
      service.updateDraft(
        created.sandbox.id,
        created.accessToken,
        99,
        created.sandbox.form,
        created.sandbox.workflow,
      ),
    ).toThrow(ConflictException)
  })

  it('publishes, submits, clarifies, and completes a high-value request', () => {
    const { sandbox, accessToken } = service.create()
    service.publish(sandbox.id, accessToken, sandbox.revision)
    service.changeRole(sandbox.id, accessToken, 'applicant')
    service.submit(sandbox.id, accessToken, {
      applicantName: 'Alex Morgan',
      applicantEmail: 'alex@example.com',
      amount: 6_500,
      category: 'equipment',
      justification: 'Replace outdated workstations.',
      confirmation: true,
      signature: 'drawn-confirmation',
    })
    service.changeRole(sandbox.id, accessToken, 'reviewer')
    const clarification = service.performAction(sandbox.id, accessToken, {
      type: 'requestClarification',
      message: 'Add a delivery date.',
    })
    expect(clarification.submission?.workflowState.status).toBe('needsClarification')

    service.changeRole(sandbox.id, accessToken, 'applicant')
    service.performAction(sandbox.id, accessToken, { type: 'resubmit' })
    service.changeRole(sandbox.id, accessToken, 'reviewer')
    const reviewed = service.performAction(sandbox.id, accessToken, { type: 'approve' })
    expect(reviewed.submission?.workflowState.currentNodeId).toBe('management')

    service.changeRole(sandbox.id, accessToken, 'management')
    const approved = service.performAction(sandbox.id, accessToken, { type: 'approve' })
    expect(approved.submission?.workflowState.status).toBe('approved')
  })

  it('rejects submission before publication', () => {
    const { sandbox, accessToken } = service.create()
    service.changeRole(sandbox.id, accessToken, 'applicant')
    expect(() => service.submit(sandbox.id, accessToken, {})).toThrow(BadRequestException)
  })
})
