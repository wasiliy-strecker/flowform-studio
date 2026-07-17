import {
  FormFieldSchema,
  createExpenseRequestTemplate,
  type ActorRole,
  type FormAnswers,
  type FormDefinition,
  type FormField,
  type FormFieldKind,
} from '@flowform/form-schema'
import {
  applyWorkflowAction,
  createExpenseApprovalWorkflow,
  startWorkflow,
  type WorkflowDefinition,
  type WorkflowState,
} from '@flowform/workflow-schema'
import { create } from 'zustand'

export type WorkspaceView = 'dashboard' | 'builder' | 'workflow' | 'submission' | 'audit'
export type ThemeMode = 'light' | 'dark'

export interface DemoComment {
  id: string
  role: ActorRole
  message: string
  fieldId?: string
  at: string
}

export interface AuditEntry {
  id: string
  action: string
  actorRole: ActorRole
  target: string
  at: string
}

interface FormSnapshot {
  form: FormDefinition
  selectedFieldId: string | undefined
}

interface WorkspaceState {
  sandboxId: string
  view: WorkspaceView
  role: ActorRole
  theme: ThemeMode
  form: FormDefinition
  workflow: WorkflowDefinition
  selectedFieldId: string | undefined
  selectedWorkflowNodeId: string | undefined
  pageIndex: number
  publishedAt: string | undefined
  publishedRevision: number | undefined
  revision: number
  answers: FormAnswers
  submissionId: string | undefined
  workflowState: WorkflowState | undefined
  comments: DemoComment[]
  auditEntries: AuditEntry[]
  past: FormSnapshot[]
  future: FormSnapshot[]
  visitedViews: WorkspaceView[]
  setView: (view: WorkspaceView) => void
  setRole: (role: ActorRole) => void
  toggleTheme: () => void
  setPageIndex: (index: number) => void
  selectField: (fieldId?: string) => void
  selectWorkflowNode: (nodeId?: string) => void
  addField: (kind: FormFieldKind, index?: number) => void
  moveField: (activeId: string, overId: string) => void
  updateSelectedField: (patch: { label?: string; description?: string; required?: boolean }) => void
  deleteSelectedField: () => void
  updateWorkflowNodePosition: (nodeId: string, position: { x: number; y: number }) => void
  undo: () => void
  redo: () => void
  publish: () => void
  updateAnswers: (answers: FormAnswers) => void
  submit: () => void
  requestClarification: (message: string) => void
  resubmit: (message: string) => void
  approve: () => void
}

const now = (): string => new Date().toISOString()
const identifier = (): string => crypto.randomUUID()

function createDefaultField(kind: FormFieldKind): FormField {
  const id = `${kind}-${identifier().slice(0, 8)}`
  const common = { id, kind, label: `New ${kind}`, required: false }
  switch (kind) {
    case 'text':
    case 'textarea':
    case 'email':
    case 'number':
    case 'date':
      return FormFieldSchema.parse(common)
    case 'select':
    case 'multiSelect':
      return FormFieldSchema.parse({
        ...common,
        options: [
          { id: `${id}-one`, label: 'Option one', value: 'one' },
          { id: `${id}-two`, label: 'Option two', value: 'two' },
        ],
      })
    case 'checkbox':
      return FormFieldSchema.parse({ ...common, confirmationLabel: 'I confirm this statement.' })
    case 'file':
      return FormFieldSchema.parse(common)
    case 'signature':
      return FormFieldSchema.parse({
        ...common,
        disclaimer: 'This drawing is a visual confirmation, not a qualified electronic signature.',
      })
    case 'section':
      return FormFieldSchema.parse({ ...common, required: false })
  }
}

function snapshot(state: Pick<WorkspaceState, 'form' | 'selectedFieldId'>): FormSnapshot {
  return {
    form: structuredClone(state.form),
    selectedFieldId: state.selectedFieldId,
  }
}

function audit(action: string, actorRole: ActorRole, target: string): AuditEntry {
  return { id: identifier(), action, actorRole, target, at: now() }
}

const initialAnswers: FormAnswers = {
  applicantName: 'Alex Morgan',
  applicantEmail: 'alex.morgan@example.com',
  amount: 6_500,
  category: 'equipment',
  justification: 'Replace two outdated design workstations used by the product team.',
  confirmation: true,
  signature: 'demo-confirmation',
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  sandboxId: identifier(),
  view: 'dashboard',
  role: 'designer',
  theme: 'dark',
  form: createExpenseRequestTemplate(),
  workflow: createExpenseApprovalWorkflow(),
  selectedFieldId: 'amount',
  selectedWorkflowNodeId: 'amount-decision',
  pageIndex: 0,
  publishedAt: undefined,
  publishedRevision: undefined,
  revision: 3,
  answers: initialAnswers,
  submissionId: undefined,
  workflowState: undefined,
  comments: [],
  auditEntries: [],
  past: [],
  future: [],
  visitedViews: ['dashboard'],

  setView: (view) =>
    set((state) => ({
      view,
      visitedViews: state.visitedViews.includes(view)
        ? state.visitedViews
        : [...state.visitedViews, view],
    })),
  setRole: (role) => set({ role }),
  toggleTheme: () => set((state) => ({ theme: state.theme === 'dark' ? 'light' : 'dark' })),
  setPageIndex: (pageIndex) => set({ pageIndex, selectedFieldId: undefined }),
  selectField: (selectedFieldId) => set({ selectedFieldId }),
  selectWorkflowNode: (selectedWorkflowNodeId) => set({ selectedWorkflowNodeId }),

  addField: (kind, index) =>
    set((state) => {
      const next = structuredClone(state.form)
      const page = next.pages[state.pageIndex]
      if (!page) return state
      const field = createDefaultField(kind)
      page.fields.splice(index ?? page.fields.length, 0, field)
      return {
        form: next,
        selectedFieldId: field.id,
        revision: state.revision + 1,
        past: [...state.past.slice(-99), snapshot(state)],
        future: [],
      }
    }),

  moveField: (activeId, overId) =>
    set((state) => {
      const next = structuredClone(state.form)
      const page = next.pages[state.pageIndex]
      if (!page) return state
      const from = page.fields.findIndex((field) => field.id === activeId)
      const to = page.fields.findIndex((field) => field.id === overId)
      if (from < 0 || to < 0 || from === to) return state
      const [moved] = page.fields.splice(from, 1)
      if (!moved) return state
      page.fields.splice(to, 0, moved)
      return {
        form: next,
        revision: state.revision + 1,
        past: [...state.past.slice(-99), snapshot(state)],
        future: [],
      }
    }),

  updateSelectedField: (patch) =>
    set((state) => {
      if (!state.selectedFieldId) return state
      const next = structuredClone(state.form)
      for (const page of next.pages) {
        const index = page.fields.findIndex((field) => field.id === state.selectedFieldId)
        if (index < 0) continue
        const current = page.fields[index]
        if (!current) return state
        const safePatch = current.kind === 'section' ? { ...patch, required: false } : patch
        page.fields[index] = FormFieldSchema.parse({ ...current, ...safePatch })
        return {
          form: next,
          revision: state.revision + 1,
          past: [...state.past.slice(-99), snapshot(state)],
          future: [],
        }
      }
      return state
    }),

  deleteSelectedField: () =>
    set((state) => {
      if (!state.selectedFieldId) return state
      const next = structuredClone(state.form)
      for (const page of next.pages) {
        const index = page.fields.findIndex((field) => field.id === state.selectedFieldId)
        if (index < 0) continue
        page.fields.splice(index, 1)
        return {
          form: next,
          selectedFieldId: undefined,
          revision: state.revision + 1,
          past: [...state.past.slice(-99), snapshot(state)],
          future: [],
        }
      }
      return state
    }),

  updateWorkflowNodePosition: (nodeId, position) =>
    set((state) => ({
      workflow: {
        ...state.workflow,
        nodes: state.workflow.nodes.map((node) =>
          node.id === nodeId ? { ...node, position } : node,
        ),
      },
      revision: state.revision + 1,
    })),

  undo: () =>
    set((state) => {
      const previous = state.past.at(-1)
      if (!previous) return state
      return {
        form: structuredClone(previous.form),
        selectedFieldId: previous.selectedFieldId,
        past: state.past.slice(0, -1),
        future: [snapshot(state), ...state.future].slice(0, 100),
        revision: state.revision + 1,
      }
    }),

  redo: () =>
    set((state) => {
      const next = state.future[0]
      if (!next) return state
      return {
        form: structuredClone(next.form),
        selectedFieldId: next.selectedFieldId,
        past: [...state.past.slice(-99), snapshot(state)],
        future: state.future.slice(1),
        revision: state.revision + 1,
      }
    }),

  publish: () =>
    set((state) => {
      const at = now()
      return {
        publishedAt: at,
        publishedRevision: state.revision,
        auditEntries: [
          audit('form.versionPublished', state.role, state.form.title),
          ...state.auditEntries,
        ],
      }
    }),

  updateAnswers: (answers) => set({ answers }),

  submit: () =>
    set((state) => {
      const at = now()
      const submissionId = identifier()
      return {
        submissionId,
        workflowState: startWorkflow(state.workflow, state.answers, at, identifier()),
        auditEntries: [
          audit('submission.created', 'applicant', submissionId),
          audit('workflow.started', 'applicant', state.workflow.name),
          ...state.auditEntries,
        ],
      }
    }),

  requestClarification: (message) =>
    set((state) => {
      if (!state.workflowState || !state.submissionId) return state
      const at = now()
      return {
        workflowState: applyWorkflowAction(
          state.workflow,
          state.workflowState,
          {
            type: 'requestClarification',
            actorRole: state.role,
            at,
            id: identifier(),
            message,
          },
          state.answers,
        ),
        comments: [
          ...state.comments,
          {
            id: identifier(),
            role: state.role,
            message,
            fieldId: 'justification',
            at,
          },
        ],
        auditEntries: [
          audit('workflow.clarificationRequested', state.role, state.submissionId),
          ...state.auditEntries,
        ],
      }
    }),

  resubmit: (message) =>
    set((state) => {
      if (!state.workflowState || !state.submissionId) return state
      const at = now()
      return {
        workflowState: applyWorkflowAction(
          state.workflow,
          state.workflowState,
          { type: 'resubmit', actorRole: state.role, at, id: identifier(), message },
          state.answers,
        ),
        comments: [...state.comments, { id: identifier(), role: state.role, message, at }],
        auditEntries: [
          audit('submission.resubmitted', state.role, state.submissionId),
          ...state.auditEntries,
        ],
      }
    }),

  approve: () =>
    set((state) => {
      if (!state.workflowState || !state.submissionId) return state
      const next = applyWorkflowAction(
        state.workflow,
        state.workflowState,
        { type: 'approve', actorRole: state.role, at: now(), id: identifier() },
        state.answers,
      )
      return {
        workflowState: next,
        auditEntries: [
          audit(
            next.status === 'approved' ? 'submission.approved' : 'workflow.taskApproved',
            state.role,
            state.submissionId,
          ),
          ...state.auditEntries,
        ],
      }
    }),
}))

export function resetWorkspaceStore(): void {
  useWorkspaceStore.setState({
    sandboxId: identifier(),
    view: 'dashboard',
    role: 'designer',
    theme: 'dark',
    form: createExpenseRequestTemplate(),
    workflow: createExpenseApprovalWorkflow(),
    selectedFieldId: 'amount',
    selectedWorkflowNodeId: 'amount-decision',
    pageIndex: 0,
    publishedAt: undefined,
    publishedRevision: undefined,
    revision: 3,
    answers: initialAnswers,
    submissionId: undefined,
    workflowState: undefined,
    comments: [],
    auditEntries: [],
    past: [],
    future: [],
    visitedViews: ['dashboard'],
  })
}
