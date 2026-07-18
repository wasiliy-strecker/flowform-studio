import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { MemorySandboxRepository } from '../src/sandbox/memory-sandbox.repository'
import { SandboxService } from '../src/sandbox/sandbox.service'

describe('SandboxService', () => {
  let repository: MemorySandboxRepository
  let service: SandboxService

  beforeEach(() => {
    repository = new MemorySandboxRepository()
    service = new SandboxService(repository)
  })

  afterEach(async () => repository.close())

  it('creates a protected sandbox and rejects an invalid token', async () => {
    const created = await service.create()
    expect(created.sandbox.form.pages).toHaveLength(2)
    await expect(service.get(created.sandbox.id, 'wrong-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    )
    await expect(service.get(created.sandbox.id, created.accessToken)).resolves.toMatchObject({
      id: created.sandbox.id,
      attachments: [],
    })
  })

  it('allows only one concurrent update for a draft revision', async () => {
    const created = await service.create()
    const updates = await Promise.allSettled([
      service.updateDraft(
        created.sandbox.id,
        created.accessToken,
        created.sandbox.revision,
        created.sandbox.form,
        created.sandbox.workflow,
      ),
      service.updateDraft(
        created.sandbox.id,
        created.accessToken,
        created.sandbox.revision,
        created.sandbox.form,
        created.sandbox.workflow,
      ),
    ])

    expect(updates.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    const rejected = updates.find((result) => result.status === 'rejected')
    expect(rejected?.status).toBe('rejected')
    if (rejected?.status !== 'rejected') throw new Error('Expected one rejected update.')
    expect(rejected.reason).toBeInstanceOf(ConflictException)
  })

  it('coalesces concurrent publication of the same draft revision', async () => {
    const created = await service.create()
    const published = await Promise.all([
      service.publish(created.sandbox.id, created.accessToken, created.sandbox.revision),
      service.publish(created.sandbox.id, created.accessToken, created.sandbox.revision),
    ])

    expect(published.map((sandbox) => sandbox.publishedVersionCount)).toEqual([1, 1])
    const reloaded = await service.get(created.sandbox.id, created.accessToken)
    expect(reloaded.publishedVersion?.version).toBe(1)
    expect(reloaded.audit.filter((entry) => entry.action === 'form.versionPublished')).toHaveLength(
      1,
    )
    const events = await repository.listPendingEvents(20)
    expect(
      events.filter(
        (event) =>
          event.type === 'sandbox.changed' && event.payload.reason === 'form.versionPublished',
      ),
    ).toHaveLength(1)
  })

  it('keeps an active submission pinned while newer versions are published', async () => {
    const { sandbox, accessToken } = await service.create()
    const versionOne = await service.publish(sandbox.id, accessToken, sandbox.revision)
    await service.changeRole(sandbox.id, accessToken, 'applicant')
    await service.submit(sandbox.id, accessToken, {
      applicantName: 'Alex Morgan',
      applicantEmail: 'alex@example.com',
      amount: 6_500,
      category: 'equipment',
      justification: 'Replace outdated workstations.',
      confirmation: true,
      signature: 'drawn-confirmation',
    })

    await service.changeRole(sandbox.id, accessToken, 'designer')
    const nextWorkflow = structuredClone(versionOne.workflow)
    const managementEdge = nextWorkflow.edges.find((edge) => edge.id === 'decision-management')
    const managementRule = managementEdge?.condition?.rules[0]
    if (!managementRule || !('value' in managementRule)) {
      throw new Error('Expected management condition.')
    }
    managementRule.value = 100_000
    const updated = await service.updateDraft(
      sandbox.id,
      accessToken,
      versionOne.revision,
      { ...versionOne.form, description: 'Version two description.' },
      nextWorkflow,
    )
    const versionTwo = await service.publish(sandbox.id, accessToken, updated.revision)

    expect(versionTwo).toMatchObject({
      publishedVersionCount: 2,
      publishedVersion: { version: 2, draftRevision: updated.revision },
      submission: { formVersion: 1 },
      submissionVersion: { version: 1 },
    })
    await expect(service.listPublishedVersions(sandbox.id, accessToken)).resolves.toEqual([
      expect.objectContaining({ version: 2 }),
      expect.objectContaining({ version: 1 }),
    ])
    const historicalVersion = await service.getPublishedVersion(sandbox.id, accessToken, 1)
    expect(historicalVersion.version).toBe(1)
    expect(historicalVersion.form.description).not.toBe('Version two description.')

    await service.changeRole(sandbox.id, accessToken, 'reviewer')
    const reviewed = await service.performAction(sandbox.id, accessToken, { type: 'approve' })
    expect(reviewed.submission?.workflowState.currentNodeId).toBe('management')
    expect(reviewed.submissionVersion?.version).toBe(1)
  })

  it('persists the clarification and two-stage approval journey in the aggregate', async () => {
    const { sandbox, accessToken } = await service.create()
    await service.publish(sandbox.id, accessToken, sandbox.revision)
    await service.changeRole(sandbox.id, accessToken, 'applicant')
    await service.submit(sandbox.id, accessToken, {
      applicantName: 'Alex Morgan',
      applicantEmail: 'alex@example.com',
      amount: 6_500,
      category: 'equipment',
      justification: 'Replace outdated workstations.',
      confirmation: true,
      signature: 'drawn-confirmation',
    })
    await service.changeRole(sandbox.id, accessToken, 'reviewer')
    const clarification = await service.performAction(sandbox.id, accessToken, {
      type: 'requestClarification',
      message: 'Add a delivery date.',
    })
    expect(clarification.submission?.workflowState.status).toBe('needsClarification')
    expect(clarification.submission?.comments).toHaveLength(1)

    await service.changeRole(sandbox.id, accessToken, 'applicant')
    await service.performAction(sandbox.id, accessToken, {
      type: 'resubmit',
      message: 'Delivery is expected on 15 September.',
    })
    await service.changeRole(sandbox.id, accessToken, 'reviewer')
    const reviewed = await service.performAction(sandbox.id, accessToken, { type: 'approve' })
    expect(reviewed.submission?.workflowState.currentNodeId).toBe('management')

    await service.changeRole(sandbox.id, accessToken, 'management')
    const approved = await service.performAction(sandbox.id, accessToken, { type: 'approve' })
    expect(approved.submission?.workflowState.status).toBe('approved')

    const reloaded = await service.get(sandbox.id, accessToken)
    expect(reloaded.submission?.workflowState.status).toBe('approved')
    expect(reloaded.audit.length).toBeGreaterThanOrEqual(9)
  })

  it('rejects submission before publication', async () => {
    const { sandbox, accessToken } = await service.create()
    await service.changeRole(sandbox.id, accessToken, 'applicant')
    await expect(service.submit(sandbox.id, accessToken, {})).rejects.toBeInstanceOf(
      BadRequestException,
    )
  })
})
