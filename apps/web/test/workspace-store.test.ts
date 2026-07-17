import { beforeEach, describe, expect, it } from 'vitest'

import { resetWorkspaceStore, useWorkspaceStore } from '../src/store'

describe('recruiter demo workflow', () => {
  beforeEach(() => resetWorkspaceStore())

  it('supports undo and redo for typed builder changes', () => {
    const initialCount = useWorkspaceStore.getState().form.pages[0]?.fields.length ?? 0
    useWorkspaceStore.getState().addField('date')
    expect(useWorkspaceStore.getState().form.pages[0]?.fields).toHaveLength(initialCount + 1)
    useWorkspaceStore.getState().undo()
    expect(useWorkspaceStore.getState().form.pages[0]?.fields).toHaveLength(initialCount)
    useWorkspaceStore.getState().redo()
    expect(useWorkspaceStore.getState().form.pages[0]?.fields).toHaveLength(initialCount + 1)
  })

  it('runs the full clarification and two-stage approval journey', () => {
    useWorkspaceStore.getState().publish()
    useWorkspaceStore.getState().submit()
    useWorkspaceStore.getState().setRole('reviewer')
    useWorkspaceStore.getState().requestClarification('Please add the delivery date.')
    expect(useWorkspaceStore.getState().workflowState?.status).toBe('needsClarification')

    useWorkspaceStore.getState().setRole('applicant')
    useWorkspaceStore.getState().resubmit('Delivery is expected on 15 September.')
    useWorkspaceStore.getState().setRole('reviewer')
    useWorkspaceStore.getState().approve()
    expect(useWorkspaceStore.getState().workflowState?.currentNodeId).toBe('management')

    useWorkspaceStore.getState().setRole('management')
    useWorkspaceStore.getState().approve()
    expect(useWorkspaceStore.getState().workflowState?.status).toBe('approved')
    expect(useWorkspaceStore.getState().auditEntries.length).toBeGreaterThanOrEqual(7)
  })
})
