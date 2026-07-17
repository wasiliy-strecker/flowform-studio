import { z } from 'zod'

export const actorRoles = ['designer', 'applicant', 'reviewer', 'management'] as const
export const ActorRoleSchema = z.enum(actorRoles)
export type ActorRole = z.infer<typeof ActorRoleSchema>

export const conditionOperators = [
  'equals',
  'notEquals',
  'greaterThan',
  'greaterThanOrEqual',
  'lessThan',
  'lessThanOrEqual',
  'contains',
  'isEmpty',
  'isNotEmpty',
] as const

export const ConditionSchema = z.object({
  fieldId: z.string().min(1),
  operator: z.enum(conditionOperators),
  value: z.unknown().optional(),
})
export type Condition = z.infer<typeof ConditionSchema>

export type RuleGroup = {
  combinator: 'all' | 'any'
  rules: Array<Condition | RuleGroup>
}

export const RuleGroupSchema: z.ZodType<RuleGroup> = z.lazy(() =>
  z.object({
    combinator: z.enum(['all', 'any']),
    rules: z.array(z.union([ConditionSchema, RuleGroupSchema])).min(1),
  }),
)

export const VisibilityRuleSchema = z.object({
  effect: z.enum(['show', 'hide']),
  when: RuleGroupSchema,
})

const FieldPermissionsSchema = z.object({
  view: z.array(ActorRoleSchema).default([...actorRoles]),
  edit: z.array(ActorRoleSchema).default(['designer']),
})

const BaseFieldSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
  required: z.boolean().default(false),
  visibility: VisibilityRuleSchema.optional(),
  permissions: FieldPermissionsSchema.default({
    view: [...actorRoles],
    edit: ['designer'],
  }),
})

const TextFieldSchema = BaseFieldSchema.extend({
  kind: z.literal('text'),
  placeholder: z.string().optional(),
  minLength: z.number().int().nonnegative().optional(),
  maxLength: z.number().int().positive().optional(),
})

const TextareaFieldSchema = BaseFieldSchema.extend({
  kind: z.literal('textarea'),
  placeholder: z.string().optional(),
  maxLength: z.number().int().positive().optional(),
})

const EmailFieldSchema = BaseFieldSchema.extend({
  kind: z.literal('email'),
  placeholder: z.string().optional(),
})

const NumberFieldSchema = BaseFieldSchema.extend({
  kind: z.literal('number'),
  minimum: z.number().optional(),
  maximum: z.number().optional(),
  currency: z.string().length(3).optional(),
})

const OptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  value: z.string(),
})

const SelectFieldSchema = BaseFieldSchema.extend({
  kind: z.literal('select'),
  options: z.array(OptionSchema).min(1),
})

const MultiSelectFieldSchema = BaseFieldSchema.extend({
  kind: z.literal('multiSelect'),
  options: z.array(OptionSchema).min(1),
})

const CheckboxFieldSchema = BaseFieldSchema.extend({
  kind: z.literal('checkbox'),
  confirmationLabel: z.string().min(1),
})

const DateFieldSchema = BaseFieldSchema.extend({
  kind: z.literal('date'),
  minimum: z.string().optional(),
  maximum: z.string().optional(),
})

const FileFieldSchema = BaseFieldSchema.extend({
  kind: z.literal('file'),
  acceptedTypes: z.array(z.string()).default(['application/pdf', 'image/png', 'image/jpeg']),
  maxBytes: z.number().int().positive().default(5_000_000),
  maxFiles: z.number().int().positive().default(1),
})

const SignatureFieldSchema = BaseFieldSchema.extend({
  kind: z.literal('signature'),
  disclaimer: z.string().min(1),
})

const SectionFieldSchema = BaseFieldSchema.extend({
  kind: z.literal('section'),
  headingLevel: z.union([z.literal(2), z.literal(3)]).default(2),
  required: z.literal(false).default(false),
})

export const FormFieldSchema = z.discriminatedUnion('kind', [
  TextFieldSchema,
  TextareaFieldSchema,
  EmailFieldSchema,
  NumberFieldSchema,
  SelectFieldSchema,
  MultiSelectFieldSchema,
  CheckboxFieldSchema,
  DateFieldSchema,
  FileFieldSchema,
  SignatureFieldSchema,
  SectionFieldSchema,
])
export type FormField = z.infer<typeof FormFieldSchema>
export type FormFieldKind = FormField['kind']

export const FormPageSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  fields: z.array(FormFieldSchema),
})
export type FormPage = z.infer<typeof FormPageSchema>

export const FormDefinitionSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  pages: z.array(FormPageSchema).min(1),
  settings: z.object({
    defaultLocale: z.enum(['en', 'de']).default('en'),
    currency: z.string().length(3).default('EUR'),
  }),
})
export type FormDefinition = z.infer<typeof FormDefinitionSchema>
export type FormAnswers = Record<string, unknown>

function isRuleGroup(rule: Condition | RuleGroup): rule is RuleGroup {
  return 'rules' in rule
}

function isEmpty(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  )
}

function comparableText(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value)
  }
  return value === undefined || value === null ? '' : (JSON.stringify(value) ?? '')
}

export function evaluateCondition(condition: Condition, answers: FormAnswers): boolean {
  const actual = answers[condition.fieldId]
  const expected = condition.value

  switch (condition.operator) {
    case 'equals':
      return actual === expected
    case 'notEquals':
      return actual !== expected
    case 'greaterThan':
      return Number(actual) > Number(expected)
    case 'greaterThanOrEqual':
      return Number(actual) >= Number(expected)
    case 'lessThan':
      return Number(actual) < Number(expected)
    case 'lessThanOrEqual':
      return Number(actual) <= Number(expected)
    case 'contains':
      return Array.isArray(actual)
        ? actual.includes(expected)
        : comparableText(actual).includes(comparableText(expected))
    case 'isEmpty':
      return isEmpty(actual)
    case 'isNotEmpty':
      return !isEmpty(actual)
  }
}

export function evaluateRuleGroup(group: RuleGroup, answers: FormAnswers): boolean {
  const results = group.rules.map((rule) =>
    isRuleGroup(rule) ? evaluateRuleGroup(rule, answers) : evaluateCondition(rule, answers),
  )
  return group.combinator === 'all' ? results.every(Boolean) : results.some(Boolean)
}

export function isFieldVisible(field: FormField, answers: FormAnswers): boolean {
  if (!field.visibility) return true
  const matches = evaluateRuleGroup(field.visibility.when, answers)
  return field.visibility.effect === 'show' ? matches : !matches
}

export type AnswerValidationErrors = Record<string, string>

export function validateAnswers(
  definition: FormDefinition,
  answers: FormAnswers,
): AnswerValidationErrors {
  const errors: AnswerValidationErrors = {}
  for (const page of definition.pages) {
    for (const field of page.fields) {
      if (field.kind === 'section' || !isFieldVisible(field, answers)) continue
      const value = answers[field.id]
      if (field.required && isEmpty(value)) {
        errors[field.id] = 'required'
        continue
      }
      if (isEmpty(value)) continue
      if (field.kind === 'email' && !z.email().safeParse(value).success) errors[field.id] = 'email'
      if (field.kind === 'number') {
        const numeric = Number(value)
        if (!Number.isFinite(numeric)) errors[field.id] = 'number'
        if (field.minimum !== undefined && numeric < field.minimum) errors[field.id] = 'minimum'
        if (field.maximum !== undefined && numeric > field.maximum) errors[field.id] = 'maximum'
      }
      if ((field.kind === 'text' || field.kind === 'textarea') && field.maxLength !== undefined) {
        if (String(value).length > field.maxLength) errors[field.id] = 'maxLength'
      }
      if (field.kind === 'text' && field.minLength !== undefined) {
        if (String(value).length < field.minLength) errors[field.id] = 'minLength'
      }
    }
  }
  return errors
}

export function createExpenseRequestTemplate(): FormDefinition {
  return FormDefinitionSchema.parse({
    schemaVersion: 1,
    id: 'expense-request',
    title: 'Expense approval request',
    description: 'A multi-stage request with contextual clarification and management approval.',
    settings: { defaultLocale: 'en', currency: 'EUR' },
    pages: [
      {
        id: 'request-details',
        title: 'Request details',
        description: 'Tell the review team what the budget is needed for.',
        fields: [
          {
            id: 'intro',
            kind: 'section',
            label: 'Expense details',
            description: 'All amounts are reviewed before approval.',
          },
          {
            id: 'applicantName',
            kind: 'text',
            label: 'Applicant name',
            placeholder: 'Alex Morgan',
            required: true,
          },
          {
            id: 'applicantEmail',
            kind: 'email',
            label: 'Work email',
            placeholder: 'alex@example.com',
            required: true,
          },
          {
            id: 'amount',
            kind: 'number',
            label: 'Requested amount',
            description: 'Requests above €5,000 require management approval.',
            minimum: 1,
            currency: 'EUR',
            required: true,
          },
          {
            id: 'category',
            kind: 'select',
            label: 'Category',
            required: true,
            options: [
              { id: 'equipment', label: 'Equipment', value: 'equipment' },
              { id: 'travel', label: 'Travel', value: 'travel' },
              { id: 'training', label: 'Training', value: 'training' },
            ],
          },
          {
            id: 'justification',
            kind: 'textarea',
            label: 'Business justification',
            placeholder: 'Explain the expected outcome and timing',
            maxLength: 800,
            required: true,
          },
        ],
      },
      {
        id: 'evidence',
        title: 'Evidence and confirmation',
        fields: [
          {
            id: 'quote',
            kind: 'file',
            label: 'Quote or supporting document',
            description:
              'Demo files are deleted with this sandbox. Do not upload confidential material.',
          },
          {
            id: 'confirmation',
            kind: 'checkbox',
            label: 'Confirmation',
            confirmationLabel: 'The information in this request is accurate.',
            required: true,
          },
          {
            id: 'signature',
            kind: 'signature',
            label: 'Drawn confirmation',
            disclaimer:
              'This drawing is a visual confirmation, not a qualified electronic signature.',
            required: true,
          },
        ],
      },
    ],
  })
}
