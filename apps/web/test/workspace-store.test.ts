import { beforeEach, describe, expect, it } from 'vitest'

import { resetWorkspaceStore, useWorkspaceStore } from '../src/store'
import { createSandboxFixture } from './fixtures'

describe('workspace draft state', () => {
  beforeEach(() => {
    resetWorkspaceStore()
    useWorkspaceStore.getState().hydrateSandbox(createSandboxFixture(), true)
  })

  it('supports undo and redo for typed builder changes', () => {
    const initialCount = useWorkspaceStore.getState().draft?.form.pages[0]?.fields.length ?? 0

    useWorkspaceStore.getState().addField('date')
    expect(useWorkspaceStore.getState().draft?.form.pages[0]?.fields).toHaveLength(initialCount + 1)

    useWorkspaceStore.getState().undo()
    expect(useWorkspaceStore.getState().draft?.form.pages[0]?.fields).toHaveLength(initialCount)

    useWorkspaceStore.getState().redo()
    expect(useWorkspaceStore.getState().draft?.form.pages[0]?.fields).toHaveLength(initialCount + 1)
  })

  it('keeps edits made while an older save is in flight', () => {
    useWorkspaceStore.getState().addField('date')
    const savedEditVersion = useWorkspaceStore.getState().editVersion
    useWorkspaceStore.getState().markSaving()
    useWorkspaceStore.getState().addField('checkbox')

    useWorkspaceStore.getState().markSaved(createSandboxFixture({ revision: 2 }), savedEditVersion)

    const state = useWorkspaceStore.getState()
    expect(state.dirty).toBe(true)
    expect(state.syncPhase).toBe('idle')
    expect(state.draft?.baseRevision).toBe(2)
    expect(state.draft?.form.pages[0]?.fields.at(-1)?.kind).toBe('checkbox')
  })

  it('supports explicit conflict rebasing and server-side discard', () => {
    useWorkspaceStore.getState().addField('date')
    useWorkspaceStore.getState().markConflict(3, 'A newer revision exists.')
    useWorkspaceStore.getState().rebaseLocalDraft(3)

    expect(useWorkspaceStore.getState().draft?.baseRevision).toBe(3)
    expect(useWorkspaceStore.getState().dirty).toBe(true)
    expect(useWorkspaceStore.getState().syncPhase).toBe('idle')

    useWorkspaceStore.getState().discardLocalDraft(createSandboxFixture({ revision: 3 }))
    expect(useWorkspaceStore.getState().dirty).toBe(false)
    expect(useWorkspaceStore.getState().draft?.baseRevision).toBe(3)
    expect(useWorkspaceStore.getState().past).toEqual([])
  })
})
