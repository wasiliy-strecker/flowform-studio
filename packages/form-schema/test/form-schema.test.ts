import { describe, expect, it } from 'vitest'

import {
  createExpenseRequestTemplate,
  evaluateRuleGroup,
  FormDefinitionSchema,
  validateAnswers,
} from '../src'

describe('form schema', () => {
  it('creates a valid expense request template', () => {
    const template = createExpenseRequestTemplate()
    expect(FormDefinitionSchema.safeParse(template).success).toBe(true)
    expect(template.pages.flatMap((page) => page.fields)).toHaveLength(9)
  })

  it('evaluates numeric workflow conditions without executing source code', () => {
    const rule = {
      combinator: 'all' as const,
      rules: [{ fieldId: 'amount', operator: 'greaterThan' as const, value: 5_000 }],
    }
    expect(evaluateRuleGroup(rule, { amount: 6_500 })).toBe(true)
    expect(evaluateRuleGroup(rule, { amount: 2_500 })).toBe(false)
  })

  it('returns focused validation errors for required and formatted fields', () => {
    const errors = validateAnswers(createExpenseRequestTemplate(), {
      applicantName: 'Alex Morgan',
      applicantEmail: 'not-an-email',
      amount: 0,
    })
    expect(errors.applicantEmail).toBe('email')
    expect(errors.amount).toBe('minimum')
    expect(errors.category).toBe('required')
  })
})
