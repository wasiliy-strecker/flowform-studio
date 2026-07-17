import { createExpenseRequestTemplate } from '@flowform/form-schema'
import { createExpenseApprovalWorkflow } from '@flowform/workflow-schema'
import { describe, expect, it } from 'vitest'

import { SandboxSessionSchema } from '../src'

describe('API contracts', () => {
  it('rejects a session without the durable aggregate collections', () => {
    const result = SandboxSessionSchema.safeParse({
      accessToken: 'a'.repeat(43),
      sandbox: {
        id: 'sandbox-1',
        expiresAt: new Date().toISOString(),
        activeRole: 'designer',
        revision: 1,
        form: createExpenseRequestTemplate(),
        workflow: createExpenseApprovalWorkflow(),
      },
    })

    expect(result.success).toBe(false)
  })
})
