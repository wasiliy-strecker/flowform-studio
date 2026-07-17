import {
  ActorRoleSchema,
  evaluateRuleGroup,
  RuleGroupSchema,
  type ActorRole,
  type FormAnswers,
} from '@flowform/form-schema'
import { z } from 'zod'

const PositionSchema = z.object({ x: z.number(), y: z.number() })
const BaseNodeSchema = z.object({ id: z.string().min(1), position: PositionSchema })

const StartNodeSchema = BaseNodeSchema.extend({
  type: z.literal('start'),
  data: z.object({ label: z.string().min(1) }),
})
const ReviewNodeSchema = BaseNodeSchema.extend({
  type: z.literal('review'),
  data: z.object({ label: z.string().min(1), assigneeRole: ActorRoleSchema }),
})
const ApprovalNodeSchema = BaseNodeSchema.extend({
  type: z.literal('approval'),
  data: z.object({ label: z.string().min(1), assigneeRole: ActorRoleSchema }),
})
const DecisionNodeSchema = BaseNodeSchema.extend({
  type: z.literal('decision'),
  data: z.object({ label: z.string().min(1) }),
})
const EndNodeSchema = BaseNodeSchema.extend({
  type: z.literal('end'),
  data: z.object({ label: z.string().min(1), outcome: z.enum(['approved', 'rejected']) }),
})

export const WorkflowNodeSchema = z.discriminatedUnion('type', [
  StartNodeSchema,
  ReviewNodeSchema,
  ApprovalNodeSchema,
  DecisionNodeSchema,
  EndNodeSchema,
])
export type WorkflowNode = z.infer<typeof WorkflowNodeSchema>
export type WorkflowNodeType = WorkflowNode['type']

export const WorkflowEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  label: z.string().optional(),
  condition: RuleGroupSchema.optional(),
  default: z.boolean().default(false),
})
export type WorkflowEdge = z.infer<typeof WorkflowEdgeSchema>

export const WorkflowDefinitionSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  name: z.string().min(1),
  nodes: z.array(WorkflowNodeSchema).min(2),
  edges: z.array(WorkflowEdgeSchema).min(1),
})
export type WorkflowDefinition = z.infer<typeof WorkflowDefinitionSchema>

export interface WorkflowValidationIssue {
  code: 'start-count' | 'dangling-edge' | 'unreachable-node' | 'decision-default' | 'cycle'
  message: string
  nodeId?: string
}

export function validateWorkflow(definition: WorkflowDefinition): WorkflowValidationIssue[] {
  const issues: WorkflowValidationIssue[] = []
  const nodesById = new Map(definition.nodes.map((node) => [node.id, node]))
  const starts = definition.nodes.filter((node) => node.type === 'start')
  if (starts.length !== 1) {
    issues.push({ code: 'start-count', message: 'A workflow needs exactly one start node.' })
  }

  for (const edge of definition.edges) {
    if (!nodesById.has(edge.source) || !nodesById.has(edge.target)) {
      issues.push({ code: 'dangling-edge', message: `Edge ${edge.id} references a missing node.` })
    }
  }

  for (const node of definition.nodes.filter((candidate) => candidate.type === 'decision')) {
    const outgoing = definition.edges.filter((edge) => edge.source === node.id)
    if (!outgoing.some((edge) => edge.default)) {
      issues.push({
        code: 'decision-default',
        message: 'A decision needs a default path.',
        nodeId: node.id,
      })
    }
  }

  const start = starts[0]
  if (start) {
    const reached = new Set<string>()
    const visiting = new Set<string>()
    const visited = new Set<string>()
    let hasCycle = false
    const visit = (id: string): void => {
      reached.add(id)
      if (visiting.has(id)) {
        hasCycle = true
        return
      }
      if (visited.has(id)) return
      visiting.add(id)
      for (const edge of definition.edges.filter((candidate) => candidate.source === id)) {
        if (nodesById.has(edge.target)) visit(edge.target)
      }
      visiting.delete(id)
      visited.add(id)
    }
    visit(start.id)
    if (hasCycle) issues.push({ code: 'cycle', message: 'Cycles are not supported in version 1.' })
    for (const node of definition.nodes) {
      if (!reached.has(node.id)) {
        issues.push({
          code: 'unreachable-node',
          message: `${node.data.label} cannot be reached from the start.`,
          nodeId: node.id,
        })
      }
    }
  }
  return issues
}

export const WorkflowStatusSchema = z.enum([
  'inReview',
  'needsClarification',
  'approved',
  'rejected',
])
export type WorkflowStatus = z.infer<typeof WorkflowStatusSchema>

export const WorkflowHistoryEntrySchema = z.object({
  id: z.string().min(1),
  nodeId: z.string().min(1),
  action: z.enum(['started', 'approved', 'clarificationRequested', 'resubmitted', 'rejected']),
  actorRole: ActorRoleSchema,
  at: z.iso.datetime(),
  message: z.string().optional(),
})
export type WorkflowHistoryEntry = z.infer<typeof WorkflowHistoryEntrySchema>

export const WorkflowStateSchema = z.object({
  currentNodeId: z.string().min(1),
  status: WorkflowStatusSchema,
  completedNodeIds: z.array(z.string().min(1)),
  history: z.array(WorkflowHistoryEntrySchema),
})
export type WorkflowState = z.infer<typeof WorkflowStateSchema>

export type WorkflowAction =
  | { type: 'approve'; actorRole: ActorRole; at: string; id: string }
  | { type: 'requestClarification'; actorRole: ActorRole; at: string; id: string; message: string }
  | { type: 'resubmit'; actorRole: ActorRole; at: string; id: string; message?: string }
  | { type: 'reject'; actorRole: ActorRole; at: string; id: string; message?: string }

function outgoingEdges(definition: WorkflowDefinition, nodeId: string): WorkflowEdge[] {
  return definition.edges.filter((edge) => edge.source === nodeId)
}

function selectEdge(
  definition: WorkflowDefinition,
  node: WorkflowNode,
  answers: FormAnswers,
): WorkflowEdge | undefined {
  const outgoing = outgoingEdges(definition, node.id)
  if (node.type !== 'decision') return outgoing[0]
  return (
    outgoing.find((edge) => edge.condition && evaluateRuleGroup(edge.condition, answers)) ??
    outgoing.find((edge) => edge.default)
  )
}

function advance(
  definition: WorkflowDefinition,
  fromNodeId: string,
  answers: FormAnswers,
  completedNodeIds: string[],
): Pick<WorkflowState, 'currentNodeId' | 'status' | 'completedNodeIds'> {
  const nodes = new Map(definition.nodes.map((node) => [node.id, node]))
  let current = nodes.get(fromNodeId)
  const completed = [...completedNodeIds]
  for (let guard = 0; guard <= definition.nodes.length; guard += 1) {
    if (!current) throw new Error(`Workflow node ${fromNodeId} does not exist.`)
    if (current.type === 'review' || current.type === 'approval') {
      return { currentNodeId: current.id, status: 'inReview', completedNodeIds: completed }
    }
    if (current.type === 'end') {
      return {
        currentNodeId: current.id,
        status: current.data.outcome,
        completedNodeIds: completed,
      }
    }
    if (!completed.includes(current.id)) completed.push(current.id)
    const edge = selectEdge(definition, current, answers)
    if (!edge) throw new Error(`Workflow node ${current.id} has no matching outgoing edge.`)
    current = nodes.get(edge.target)
  }
  throw new Error('Workflow traversal exceeded its cycle guard.')
}

export function startWorkflow(
  definition: WorkflowDefinition,
  answers: FormAnswers,
  at: string,
  id: string,
): WorkflowState {
  const issues = validateWorkflow(definition)
  if (issues.length > 0) throw new Error(issues.map((issue) => issue.message).join(' '))
  const start = definition.nodes.find((node) => node.type === 'start')
  if (!start) throw new Error('A start node is required.')
  const advanced = advance(definition, start.id, answers, [])
  return {
    ...advanced,
    history: [
      {
        id,
        nodeId: start.id,
        action: 'started',
        actorRole: 'applicant',
        at,
      },
    ],
  }
}

export function applyWorkflowAction(
  definition: WorkflowDefinition,
  state: WorkflowState,
  action: WorkflowAction,
  answers: FormAnswers,
): WorkflowState {
  const current = definition.nodes.find((node) => node.id === state.currentNodeId)
  if (!current) throw new Error('The active workflow node no longer exists.')

  if (action.type === 'resubmit') {
    if (state.status !== 'needsClarification' || action.actorRole !== 'applicant') {
      throw new Error('Only the applicant can resubmit a request awaiting clarification.')
    }
    return {
      ...state,
      status: 'inReview',
      history: [
        ...state.history,
        {
          id: action.id,
          nodeId: current.id,
          action: 'resubmitted',
          actorRole: action.actorRole,
          at: action.at,
          ...(action.message ? { message: action.message } : {}),
        },
      ],
    }
  }

  if (current.type !== 'review' && current.type !== 'approval') {
    throw new Error('The workflow is not waiting at an actionable task.')
  }
  if (current.data.assigneeRole !== action.actorRole) {
    throw new Error(`This task requires the ${current.data.assigneeRole} role.`)
  }
  if (state.status !== 'inReview') throw new Error('This task is not currently actionable.')

  if (action.type === 'requestClarification') {
    return {
      ...state,
      status: 'needsClarification',
      history: [
        ...state.history,
        {
          id: action.id,
          nodeId: current.id,
          action: 'clarificationRequested',
          actorRole: action.actorRole,
          at: action.at,
          message: action.message,
        },
      ],
    }
  }

  if (action.type === 'reject') {
    return {
      ...state,
      status: 'rejected',
      history: [
        ...state.history,
        {
          id: action.id,
          nodeId: current.id,
          action: 'rejected',
          actorRole: action.actorRole,
          at: action.at,
          ...(action.message ? { message: action.message } : {}),
        },
      ],
    }
  }

  const completed = state.completedNodeIds.includes(current.id)
    ? state.completedNodeIds
    : [...state.completedNodeIds, current.id]
  const edge = selectEdge(definition, current, answers)
  if (!edge) throw new Error(`Workflow node ${current.id} has no outgoing edge.`)
  const advanced = advance(definition, edge.target, answers, completed)
  return {
    ...advanced,
    history: [
      ...state.history,
      {
        id: action.id,
        nodeId: current.id,
        action: 'approved',
        actorRole: action.actorRole,
        at: action.at,
      },
    ],
  }
}

export function createExpenseApprovalWorkflow(): WorkflowDefinition {
  return WorkflowDefinitionSchema.parse({
    schemaVersion: 1,
    id: 'expense-approval',
    name: 'Conditional expense approval',
    nodes: [
      { id: 'start', type: 'start', position: { x: 0, y: 140 }, data: { label: 'Submitted' } },
      {
        id: 'review',
        type: 'review',
        position: { x: 250, y: 140 },
        data: { label: 'Operations review', assigneeRole: 'reviewer' },
      },
      {
        id: 'amount-decision',
        type: 'decision',
        position: { x: 520, y: 140 },
        data: { label: 'Above €5,000?' },
      },
      {
        id: 'management',
        type: 'approval',
        position: { x: 790, y: 40 },
        data: { label: 'Management approval', assigneeRole: 'management' },
      },
      {
        id: 'approved',
        type: 'end',
        position: { x: 1_070, y: 140 },
        data: { label: 'Approved', outcome: 'approved' },
      },
    ],
    edges: [
      { id: 'start-review', source: 'start', target: 'review' },
      { id: 'review-decision', source: 'review', target: 'amount-decision' },
      {
        id: 'decision-management',
        source: 'amount-decision',
        target: 'management',
        label: 'Yes',
        condition: {
          combinator: 'all',
          rules: [{ fieldId: 'amount', operator: 'greaterThan', value: 5_000 }],
        },
      },
      {
        id: 'decision-approved',
        source: 'amount-decision',
        target: 'approved',
        label: 'No',
        default: true,
      },
      { id: 'management-approved', source: 'management', target: 'approved' },
    ],
  })
}
