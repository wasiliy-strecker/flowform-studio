import type { SandboxContract } from '@flowform/api-contracts'
import {
  FormFieldSchema,
  type FormAnswers,
  type FormDefinition,
  type FormField,
  type FormFieldKind,
} from '@flowform/form-schema'
import type { WorkflowDefinition } from '@flowform/workflow-schema'
import { create } from 'zustand'

export type WorkspaceView = 'dashboard' | 'builder' | 'workflow' | 'submission' | 'audit'
export type ThemeMode = 'light' | 'dark'
export type SyncPhase = 'idle' | 'saving' | 'saved' | 'conflict' | 'error'

export interface EditableDraft {
  form: FormDefinition
  workflow: WorkflowDefinition
  baseRevision: number
}

interface DraftSnapshot {
  draft: EditableDraft
  selectedFieldId: string | undefined
  selectedWorkflowNodeId: string | undefined
}

interface WorkspaceState {
  view: WorkspaceView
  theme: ThemeMode
  selectedFieldId: string | undefined
  selectedWorkflowNodeId: string | undefined
  pageIndex: number
  draft: EditableDraft | undefined
  answers: FormAnswers
  dirty: boolean
  editVersion: number
  syncPhase: SyncPhase
  syncMessage: string | undefined
  conflictRevision: number | undefined
  savedAt: string | undefined
  past: DraftSnapshot[]
  future: DraftSnapshot[]
  visitedViews: WorkspaceView[]
  setView: (view: WorkspaceView) => void
  toggleTheme: () => void
  setPageIndex: (index: number) => void
  selectField: (fieldId?: string) => void
  selectWorkflowNode: (nodeId?: string) => void
  hydrateSandbox: (sandbox: SandboxContract, force?: boolean) => void
  markSaving: () => void
  markSaved: (sandbox: SandboxContract, savedEditVersion: number) => void
  markConflict: (actualRevision: number, message: string) => void
  markSyncError: (message: string) => void
  rebaseLocalDraft: (actualRevision: number) => void
  discardLocalDraft: (sandbox: SandboxContract) => void
  addField: (kind: FormFieldKind, index?: number) => void
  moveField: (activeId: string, overId: string) => void
  updateSelectedField: (patch: { label?: string; description?: string; required?: boolean }) => void
  deleteSelectedField: () => void
  updateWorkflowNodePosition: (nodeId: string, position: { x: number; y: number }) => void
  undo: () => void
  redo: () => void
  updateAnswers: (answers: FormAnswers) => void
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

const initialState = {
  view: 'dashboard' as WorkspaceView,
  theme: 'dark' as ThemeMode,
  selectedFieldId: undefined,
  selectedWorkflowNodeId: undefined,
  pageIndex: 0,
  draft: undefined,
  answers: initialAnswers,
  dirty: false,
  editVersion: 0,
  syncPhase: 'idle' as SyncPhase,
  syncMessage: undefined,
  conflictRevision: undefined,
  savedAt: undefined,
  past: [] as DraftSnapshot[],
  future: [] as DraftSnapshot[],
  visitedViews: ['dashboard'] as WorkspaceView[],
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  ...initialState,

  setView: (view) =>
    set((state) => ({
      view,
      visitedViews: state.visitedViews.includes(view)
        ? state.visitedViews
        : [...state.visitedViews, view],
    })),
  toggleTheme: () => set((state) => ({ theme: state.theme === 'dark' ? 'light' : 'dark' })),
  setPageIndex: (pageIndex) => set({ pageIndex, selectedFieldId: undefined }),
  selectField: (selectedFieldId) => set({ selectedFieldId }),
  selectWorkflowNode: (selectedWorkflowNodeId) => set({ selectedWorkflowNodeId }),

  hydrateSandbox: (sandbox, force = false) =>
    set((state) => {
      if (state.draft && !force && (state.dirty || state.syncPhase === 'saving')) return state
      return {
        draft: draftFrom(sandbox),
        selectedFieldId: state.selectedFieldId ?? firstSelectableFieldId(sandbox.form) ?? undefined,
        selectedWorkflowNodeId:
          state.selectedWorkflowNodeId ?? sandbox.workflow.nodes[0]?.id ?? undefined,
        dirty: false,
        syncPhase: 'saved',
        syncMessage: undefined,
        conflictRevision: undefined,
        past: force ? [] : state.past,
        future: force ? [] : state.future,
      }
    }),
  markSaving: () => set({ syncPhase: 'saving', syncMessage: undefined }),
  markSaved: (sandbox, savedEditVersion) =>
    set((state) => {
      if (state.editVersion !== savedEditVersion && state.draft) {
        return {
          draft: { ...state.draft, baseRevision: sandbox.revision },
          dirty: true,
          syncPhase: 'idle',
          syncMessage: undefined,
          conflictRevision: undefined,
        }
      }
      return {
        draft: draftFrom(sandbox),
        dirty: false,
        syncPhase: 'saved',
        syncMessage: undefined,
        conflictRevision: undefined,
        savedAt: new Date().toISOString(),
      }
    }),
  markConflict: (actualRevision, message) =>
    set({
      syncPhase: 'conflict',
      syncMessage: message,
      conflictRevision: actualRevision,
    }),
  markSyncError: (syncMessage) => set({ syncPhase: 'error', syncMessage }),
  rebaseLocalDraft: (actualRevision) =>
    set((state) => ({
      draft: state.draft ? { ...state.draft, baseRevision: actualRevision } : undefined,
      dirty: Boolean(state.draft),
      syncPhase: 'idle',
      syncMessage: undefined,
      conflictRevision: undefined,
    })),
  discardLocalDraft: (sandbox) =>
    set({
      draft: draftFrom(sandbox),
      dirty: false,
      syncPhase: 'saved',
      syncMessage: undefined,
      conflictRevision: undefined,
      past: [],
      future: [],
    }),

  addField: (kind, index) =>
    set((state) => {
      if (!state.draft) return state
      const next = structuredClone(state.draft)
      const page = next.form.pages[state.pageIndex]
      if (!page) return state
      const field = createDefaultField(kind)
      page.fields.splice(index ?? page.fields.length, 0, field)
      return edited(state, next, { selectedFieldId: field.id })
    }),

  moveField: (activeId, overId) =>
    set((state) => {
      if (!state.draft) return state
      const next = structuredClone(state.draft)
      const page = next.form.pages[state.pageIndex]
      if (!page) return state
      const from = page.fields.findIndex((field) => field.id === activeId)
      const to = page.fields.findIndex((field) => field.id === overId)
      if (from < 0 || to < 0 || from === to) return state
      const [moved] = page.fields.splice(from, 1)
      if (!moved) return state
      page.fields.splice(to, 0, moved)
      return edited(state, next)
    }),

  updateSelectedField: (patch) =>
    set((state) => {
      if (!state.draft || !state.selectedFieldId) return state
      const next = structuredClone(state.draft)
      for (const page of next.form.pages) {
        const index = page.fields.findIndex((field) => field.id === state.selectedFieldId)
        if (index < 0) continue
        const current = page.fields[index]
        if (!current) return state
        const safePatch = current.kind === 'section' ? { ...patch, required: false } : patch
        const parsed = FormFieldSchema.safeParse({ ...current, ...safePatch })
        if (!parsed.success) return state
        page.fields[index] = parsed.data
        return edited(state, next)
      }
      return state
    }),

  deleteSelectedField: () =>
    set((state) => {
      if (!state.draft || !state.selectedFieldId) return state
      const next = structuredClone(state.draft)
      for (const page of next.form.pages) {
        const index = page.fields.findIndex((field) => field.id === state.selectedFieldId)
        if (index < 0) continue
        page.fields.splice(index, 1)
        return edited(state, next, { selectedFieldId: undefined })
      }
      return state
    }),

  updateWorkflowNodePosition: (nodeId, position) =>
    set((state) => {
      if (!state.draft) return state
      const next = structuredClone(state.draft)
      next.workflow.nodes = next.workflow.nodes.map((node) =>
        node.id === nodeId ? { ...node, position } : node,
      )
      return edited(state, next)
    }),

  undo: () =>
    set((state) => {
      const previous = state.past.at(-1)
      if (!previous || !state.draft) return state
      return {
        draft: structuredClone(previous.draft),
        selectedFieldId: previous.selectedFieldId,
        selectedWorkflowNodeId: previous.selectedWorkflowNodeId,
        past: state.past.slice(0, -1),
        future: [snapshot(state), ...state.future].slice(0, 100),
        dirty: true,
        editVersion: state.editVersion + 1,
        syncPhase: state.syncPhase === 'conflict' ? 'conflict' : 'idle',
      }
    }),

  redo: () =>
    set((state) => {
      const next = state.future[0]
      if (!next || !state.draft) return state
      return {
        draft: structuredClone(next.draft),
        selectedFieldId: next.selectedFieldId,
        selectedWorkflowNodeId: next.selectedWorkflowNodeId,
        past: [...state.past.slice(-99), snapshot(state)],
        future: state.future.slice(1),
        dirty: true,
        editVersion: state.editVersion + 1,
        syncPhase: state.syncPhase === 'conflict' ? 'conflict' : 'idle',
      }
    }),

  updateAnswers: (answers) => set({ answers }),
}))

function edited(
  state: WorkspaceState,
  draft: EditableDraft,
  extra: Partial<Pick<WorkspaceState, 'selectedFieldId' | 'selectedWorkflowNodeId'>> = {},
): Partial<WorkspaceState> {
  return {
    draft,
    ...extra,
    dirty: true,
    editVersion: state.editVersion + 1,
    past: [...state.past.slice(-99), snapshot(state)],
    future: [],
    syncPhase: state.syncPhase === 'conflict' ? 'conflict' : 'idle',
    syncMessage: state.syncPhase === 'conflict' ? state.syncMessage : undefined,
  }
}

function snapshot(
  state: Pick<WorkspaceState, 'draft' | 'selectedFieldId' | 'selectedWorkflowNodeId'>,
): DraftSnapshot {
  if (!state.draft) throw new Error('Cannot snapshot an uninitialized workspace.')
  return {
    draft: structuredClone(state.draft),
    selectedFieldId: state.selectedFieldId,
    selectedWorkflowNodeId: state.selectedWorkflowNodeId,
  }
}

function draftFrom(sandbox: SandboxContract): EditableDraft {
  return {
    form: structuredClone(sandbox.form),
    workflow: structuredClone(sandbox.workflow),
    baseRevision: sandbox.revision,
  }
}

function firstSelectableFieldId(form: FormDefinition): string | undefined {
  return form.pages.flatMap((page) => page.fields)[0]?.id
}

function createDefaultField(kind: FormFieldKind): FormField {
  const id = `${kind}-${crypto.randomUUID().slice(0, 8)}`
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

export function resetWorkspaceStore(): void {
  useWorkspaceStore.setState({
    ...initialState,
    answers: structuredClone(initialAnswers),
    past: [],
    future: [],
    visitedViews: ['dashboard'],
  })
}
