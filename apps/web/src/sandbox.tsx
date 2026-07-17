import {
  RevisionConflictDetailsSchema,
  type SandboxContract,
  type SandboxSession,
  type StoredAttachment,
  type WorkflowActionInput,
} from '@flowform/api-contracts'
import { FlowFormApiClient, FlowFormApiError } from '@flowform/api-client'
import type { ActorRole, FormAnswers } from '@flowform/form-schema'
import { RealtimeEventSchema, RealtimeReadySchema } from '@flowform/realtime-contracts'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { io, type Socket } from 'socket.io-client'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import { useWorkspaceStore } from './store'

const sessionStorageKey = 'flowform.sandbox-session.v1'
const sessionQueryKey = ['flowform', 'sandbox-session'] as const
const defaultClient = new FlowFormApiClient(configuredApiUrl())

type RealtimeStatus = 'connecting' | 'online' | 'offline' | 'disabled'

interface SandboxContextValue {
  session: SandboxSession | undefined
  sandbox: SandboxContract | undefined
  isLoading: boolean
  bootstrapError: string | undefined
  pendingAction: string | undefined
  actionError: string | undefined
  realtimeStatus: RealtimeStatus
  saveDraft: () => Promise<SandboxContract>
  publishDraft: () => Promise<SandboxContract>
  changeRole: (role: ActorRole) => Promise<SandboxContract>
  submitRequest: (answers: FormAnswers) => Promise<SandboxContract>
  performWorkflowAction: (action: WorkflowActionInput) => Promise<SandboxContract>
  addComment: (message: string, anchorFieldId?: string) => Promise<SandboxContract>
  uploadAttachment: (file: File) => Promise<StoredAttachment>
  discardLocalDraft: () => Promise<void>
  keepLocalDraft: () => Promise<void>
  retryBootstrap: () => Promise<void>
  createFreshSandbox: () => Promise<void>
  clearActionError: () => void
}

const SandboxContext = createContext<SandboxContextValue | undefined>(undefined)

export function SandboxProvider({
  children,
  client = defaultClient,
}: {
  children: ReactNode
  client?: FlowFormApiClient
}): React.JSX.Element {
  const queryClient = useQueryClient()
  const [pendingAction, setPendingAction] = useState<string>()
  const [actionError, setActionError] = useState<string>()
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>(
    import.meta.env.MODE === 'test' ? 'disabled' : 'connecting',
  )
  const savePromise = useRef<Promise<SandboxContract> | undefined>(undefined)
  const sessionRef = useRef<SandboxSession | undefined>(undefined)

  const sessionQuery = useQuery({
    queryKey: sessionQueryKey,
    queryFn: () => loadOrCreateSession(client),
    staleTime: Number.POSITIVE_INFINITY,
    retry: 1,
    refetchInterval: import.meta.env.MODE === 'test' ? false : 30_000,
  })
  sessionRef.current = sessionQuery.data

  const setSandbox = useCallback(
    (sandbox: SandboxContract): SandboxSession => {
      const current = sessionRef.current
      if (!current) throw new Error('The FlowForm sandbox has not initialized.')
      const next = { ...current, sandbox }
      sessionRef.current = next
      queryClient.setQueryData(sessionQueryKey, next)
      useWorkspaceStore.getState().hydrateSandbox(sandbox)
      return next
    },
    [queryClient],
  )

  useEffect(() => {
    if (sessionQuery.data) useWorkspaceStore.getState().hydrateSandbox(sessionQuery.data.sandbox)
  }, [sessionQuery.data])

  const saveDraft = useCallback(async (): Promise<SandboxContract> => {
    if (savePromise.current) return savePromise.current
    const execute = async (): Promise<SandboxContract> => {
      const session = requireSession(sessionRef.current)
      const state = useWorkspaceStore.getState()
      if (!state.draft || !state.dirty) return session.sandbox
      if (state.syncPhase === 'conflict') {
        throw new Error('Resolve the draft conflict before saving.')
      }
      const savedEditVersion = state.editVersion
      state.markSaving()
      try {
        const sandbox = await client.updateDraft(
          session.sandbox.id,
          session.accessToken,
          state.draft.baseRevision,
          state.draft.form,
          state.draft.workflow,
        )
        setSandbox(sandbox)
        useWorkspaceStore.getState().markSaved(sandbox, savedEditVersion)
        return sandbox
      } catch (error) {
        const conflict = revisionConflict(error)
        if (conflict) {
          useWorkspaceStore
            .getState()
            .markConflict(conflict.actualRevision, 'A newer draft revision exists on the server.')
          await queryClient.invalidateQueries({ queryKey: sessionQueryKey })
        } else {
          useWorkspaceStore
            .getState()
            .markSyncError(error instanceof Error ? error.message : 'The draft could not be saved.')
        }
        throw error
      }
    }
    const promise = execute().finally(() => {
      savePromise.current = undefined
    })
    savePromise.current = promise
    return promise
  }, [client, queryClient, setSandbox])

  const dirty = useWorkspaceStore((state) => state.dirty)
  const editVersion = useWorkspaceStore((state) => state.editVersion)
  const syncPhase = useWorkspaceStore((state) => state.syncPhase)
  useEffect(() => {
    if (
      !dirty ||
      syncPhase !== 'idle' ||
      !sessionQuery.data ||
      sessionQuery.data.sandbox.activeRole !== 'designer'
    ) {
      return
    }
    const timer = window.setTimeout(() => {
      void saveDraft().catch(() => undefined)
    }, 700)
    return () => window.clearTimeout(timer)
  }, [dirty, editVersion, saveDraft, sessionQuery.data, syncPhase])

  const runAction = useCallback(async <T,>(label: string, action: () => Promise<T>): Promise<T> => {
    setPendingAction(label)
    setActionError(undefined)
    try {
      return await action()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'The action could not be completed.')
      throw error
    } finally {
      setPendingAction(undefined)
    }
  }, [])

  const ensureRole = useCallback(
    async (role: ActorRole): Promise<SandboxSession> => {
      const current = requireSession(sessionRef.current)
      if (current.sandbox.activeRole === role) return current
      const sandbox = await client.changeRole(current.sandbox.id, current.accessToken, role)
      return setSandbox(sandbox)
    },
    [client, setSandbox],
  )

  const publishDraft = useCallback(
    () =>
      runAction('publish', async () => {
        await ensureRole('designer')
        await saveDraft()
        const designer = requireSession(sessionRef.current)
        const sandbox = await client.publish(
          designer.sandbox.id,
          designer.accessToken,
          designer.sandbox.revision,
        )
        setSandbox(sandbox)
        return sandbox
      }),
    [ensureRole, runAction, saveDraft, setSandbox],
  )

  const changeRole = useCallback(
    (role: ActorRole) =>
      runAction('role', async () => {
        let session = requireSession(sessionRef.current)
        if (useWorkspaceStore.getState().dirty) {
          session = await ensureRole('designer')
          await saveDraft()
          session = requireSession(sessionRef.current)
        }
        if (session.sandbox.activeRole === role) return session.sandbox
        const sandbox = await client.changeRole(session.sandbox.id, session.accessToken, role)
        setSandbox(sandbox)
        return sandbox
      }),
    [client, ensureRole, runAction, saveDraft, setSandbox],
  )

  const submitRequest = useCallback(
    (answers: FormAnswers) =>
      runAction('submit', async () => {
        if (useWorkspaceStore.getState().dirty) await ensureRole('designer')
        await saveDraft()
        let session = requireSession(sessionRef.current)
        if (session.sandbox.publishedVersion?.draftRevision !== session.sandbox.revision) {
          session = await ensureRole('designer')
          const published = await client.publish(
            session.sandbox.id,
            session.accessToken,
            session.sandbox.revision,
          )
          session = setSandbox(published)
        }
        session = await ensureRole('applicant')
        const sandbox = await client.submit(session.sandbox.id, session.accessToken, answers)
        setSandbox(sandbox)
        return sandbox
      }),
    [client, ensureRole, runAction, saveDraft, setSandbox],
  )

  const performWorkflowAction = useCallback(
    (action: WorkflowActionInput) =>
      runAction('workflow', async () => {
        const session = requireSession(sessionRef.current)
        const sandbox = await client.performWorkflowAction(
          session.sandbox.id,
          session.accessToken,
          action,
        )
        setSandbox(sandbox)
        return sandbox
      }),
    [client, runAction, setSandbox],
  )

  const addComment = useCallback(
    (message: string, anchorFieldId?: string) =>
      runAction('comment', async () => {
        const session = requireSession(sessionRef.current)
        const sandbox = await client.addComment(
          session.sandbox.id,
          session.accessToken,
          message,
          anchorFieldId,
        )
        setSandbox(sandbox)
        return sandbox
      }),
    [client, runAction, setSandbox],
  )

  const uploadAttachment = useCallback(
    (file: File) =>
      runAction('upload', async () => {
        const session = requireSession(sessionRef.current)
        const attachment = await client.uploadAttachment(
          session.sandbox.id,
          session.accessToken,
          file,
        )
        const sandbox = await client.getSandbox(session.sandbox.id, session.accessToken)
        setSandbox(sandbox)
        return attachment
      }),
    [client, runAction, setSandbox],
  )

  const discardLocalDraft = useCallback(async (): Promise<void> => {
    const session = requireSession(sessionRef.current)
    const sandbox = await client.getSandbox(session.sandbox.id, session.accessToken)
    setSandbox(sandbox)
    useWorkspaceStore.getState().discardLocalDraft(sandbox)
  }, [client, setSandbox])

  const keepLocalDraft = useCallback(async (): Promise<void> => {
    const session = requireSession(sessionRef.current)
    const sandbox = await client.getSandbox(session.sandbox.id, session.accessToken)
    setSandbox(sandbox)
    useWorkspaceStore.getState().rebaseLocalDraft(sandbox.revision)
    await saveDraft()
  }, [client, saveDraft, setSandbox])

  const retryBootstrap = useCallback(async (): Promise<void> => {
    await sessionQuery.refetch()
  }, [sessionQuery])

  const createFreshSandbox = useCallback(async (): Promise<void> => {
    clearStoredSession()
    const session = await client.createSandbox()
    storeSession(session)
    sessionRef.current = session
    queryClient.setQueryData(sessionQueryKey, session)
    useWorkspaceStore.getState().hydrateSandbox(session.sandbox, true)
  }, [client, queryClient])

  useEffect(() => {
    if (import.meta.env.MODE === 'test' || !sessionQuery.data) return
    const seen = new Set<string>()
    const socket: Socket = io(`${client.realtimeOrigin()}/realtime`, {
      auth: {
        sandboxId: sessionQuery.data.sandbox.id,
        accessToken: sessionQuery.data.accessToken,
      },
    })
    setRealtimeStatus('connecting')
    socket.on('connect', () => setRealtimeStatus('connecting'))
    socket.on('realtime.ready', (input: unknown) => {
      const ready = RealtimeReadySchema.safeParse(input)
      if (ready.success && ready.data.sandboxId === sessionQuery.data?.sandbox.id) {
        setRealtimeStatus('online')
      }
    })
    socket.on('disconnect', () => setRealtimeStatus('offline'))
    socket.on('connect_error', () => setRealtimeStatus('offline'))
    socket.on('realtime.event', (input: unknown) => {
      const result = RealtimeEventSchema.safeParse(input)
      if (!result.success || seen.has(result.data.id)) return
      seen.add(result.data.id)
      if (seen.size > 500) seen.delete(seen.values().next().value ?? '')
      if (result.data.type === 'sandbox.changed') {
        void queryClient.invalidateQueries({ queryKey: sessionQueryKey })
      }
    })
    return () => {
      socket.close()
    }
  }, [client, queryClient, sessionQuery.data?.accessToken, sessionQuery.data?.sandbox.id])

  const value = useMemo<SandboxContextValue>(
    () => ({
      session: sessionQuery.data,
      sandbox: sessionQuery.data?.sandbox,
      isLoading: sessionQuery.isLoading,
      bootstrapError: sessionQuery.error instanceof Error ? sessionQuery.error.message : undefined,
      pendingAction,
      actionError,
      realtimeStatus,
      saveDraft,
      publishDraft,
      changeRole,
      submitRequest,
      performWorkflowAction,
      addComment,
      uploadAttachment,
      discardLocalDraft,
      keepLocalDraft,
      retryBootstrap,
      createFreshSandbox,
      clearActionError: () => setActionError(undefined),
    }),
    [
      addComment,
      actionError,
      changeRole,
      createFreshSandbox,
      discardLocalDraft,
      keepLocalDraft,
      pendingAction,
      performWorkflowAction,
      publishDraft,
      realtimeStatus,
      retryBootstrap,
      saveDraft,
      sessionQuery.data,
      sessionQuery.error,
      sessionQuery.isLoading,
      submitRequest,
      uploadAttachment,
    ],
  )

  return <SandboxContext.Provider value={value}>{children}</SandboxContext.Provider>
}

export function useSandbox(): SandboxContextValue {
  const context = useContext(SandboxContext)
  if (!context) throw new Error('useSandbox must be used inside SandboxProvider.')
  return context
}

async function loadOrCreateSession(client: FlowFormApiClient): Promise<SandboxSession> {
  const stored = readStoredSession()
  if (stored) {
    try {
      const sandbox = await client.getSandbox(stored.sandboxId, stored.accessToken)
      return { accessToken: stored.accessToken, sandbox }
    } catch (error) {
      if (!(error instanceof FlowFormApiError) || ![401, 404, 410].includes(error.status)) {
        throw error
      }
      clearStoredSession()
    }
  }
  const session = await client.createSandbox()
  storeSession(session)
  return session
}

function readStoredSession(): { sandboxId: string; accessToken: string } | undefined {
  try {
    const value = window.sessionStorage.getItem(sessionStorageKey)
    if (!value) return undefined
    const parsed = JSON.parse(value) as unknown
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !('sandboxId' in parsed) ||
      !('accessToken' in parsed) ||
      typeof parsed.sandboxId !== 'string' ||
      typeof parsed.accessToken !== 'string'
    ) {
      return undefined
    }
    return { sandboxId: parsed.sandboxId, accessToken: parsed.accessToken }
  } catch {
    return undefined
  }
}

function storeSession(session: SandboxSession): void {
  try {
    window.sessionStorage.setItem(
      sessionStorageKey,
      JSON.stringify({ sandboxId: session.sandbox.id, accessToken: session.accessToken }),
    )
  } catch {
    // The in-memory query session still works when browser storage is unavailable.
  }
}

function clearStoredSession(): void {
  try {
    window.sessionStorage.removeItem(sessionStorageKey)
  } catch {
    // Nothing else is required when browser storage is unavailable.
  }
}

function requireSession(session: SandboxSession | undefined): SandboxSession {
  if (!session) throw new Error('The FlowForm sandbox is not ready yet.')
  return session
}

function revisionConflict(error: unknown): { actualRevision: number } | undefined {
  if (!(error instanceof FlowFormApiError) || error.code !== 'revision_conflict') return undefined
  const details = RevisionConflictDetailsSchema.safeParse(error.problem?.details)
  return details.success ? { actualRevision: details.data.actualRevision } : undefined
}

function configuredApiUrl(): string {
  const value: unknown = import.meta.env['VITE_API_URL']
  return typeof value === 'string' && value.length > 0 ? value : '/api/v1'
}
