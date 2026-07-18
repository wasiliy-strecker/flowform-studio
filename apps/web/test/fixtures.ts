import type { SandboxContract, SandboxSession } from '@flowform/api-contracts'
import { createExpenseRequestTemplate } from '@flowform/form-schema'
import { createExpenseApprovalWorkflow } from '@flowform/workflow-schema'

export function createSandboxFixture(overrides: Partial<SandboxContract> = {}): SandboxContract {
  return {
    id: 'sandbox-test-001',
    expiresAt: '2030-01-02T00:00:00.000Z',
    activeRole: 'designer',
    revision: 1,
    form: createExpenseRequestTemplate(),
    workflow: createExpenseApprovalWorkflow(),
    publishedVersionCount: 0,
    attachments: [],
    audit: [
      {
        id: 'audit-test-001',
        actorRole: 'designer',
        action: 'sandbox.created',
        targetId: 'sandbox-test-001',
        occurredAt: '2030-01-01T00:00:00.000Z',
      },
    ],
    ...overrides,
  }
}

export function createSessionFixture(
  sandbox: SandboxContract = createSandboxFixture(),
): SandboxSession {
  return {
    accessToken: 'test-access-token-with-at-least-thirty-two-characters',
    sandbox,
  }
}
