import type { ActorRole } from '@flowform/form-schema'
import {
  Activity,
  Blocks,
  ClipboardCheck,
  FileStack,
  Languages,
  LayoutDashboard,
  LoaderCircle,
  Moon,
  Network,
  RefreshCw,
  ShieldCheck,
  Sun,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { lazy, Suspense, useEffect, type ComponentType } from 'react'
import { useTranslation } from 'react-i18next'

import { useSandbox } from './sandbox'
import { useWorkspaceStore, type WorkspaceView } from './store'

const AuditView = lazy(() =>
  import('./components/AuditView').then((module) => ({ default: module.AuditView })),
)
const DashboardView = lazy(() =>
  import('./components/DashboardView').then((module) => ({ default: module.DashboardView })),
)
const FormBuilderView = lazy(() =>
  import('./components/FormBuilderView').then((module) => ({ default: module.FormBuilderView })),
)
const SubmissionView = lazy(() =>
  import('./components/SubmissionView').then((module) => ({ default: module.SubmissionView })),
)
const WorkflowView = lazy(() =>
  import('./components/WorkflowView').then((module) => ({ default: module.WorkflowView })),
)

interface NavigationItem {
  id: WorkspaceView
  icon: ComponentType<{ size?: number; strokeWidth?: number }>
  labelKey: string
}

const navigation: NavigationItem[] = [
  { id: 'dashboard', icon: LayoutDashboard, labelKey: 'dashboard' },
  { id: 'builder', icon: Blocks, labelKey: 'builder' },
  { id: 'workflow', icon: Network, labelKey: 'workflow' },
  { id: 'submission', icon: ClipboardCheck, labelKey: 'submission' },
  { id: 'audit', icon: Activity, labelKey: 'audit' },
]

const roles: ActorRole[] = ['designer', 'applicant', 'reviewer', 'management']

function CurrentView(): React.JSX.Element {
  const view = useWorkspaceStore((state) => state.view)
  switch (view) {
    case 'dashboard':
      return <DashboardView />
    case 'builder':
      return <FormBuilderView />
    case 'workflow':
      return <WorkflowView />
    case 'submission':
      return <SubmissionView />
    case 'audit':
      return <AuditView />
  }
}

export default function App(): React.JSX.Element {
  const { t } = useTranslation()
  const { sandbox, isLoading, bootstrapError, retryBootstrap, createFreshSandbox } = useSandbox()

  if (isLoading) {
    return (
      <main className="bootstrap-screen" aria-live="polite">
        <span className="brand-mark">F</span>
        <LoaderCircle className="spin" size={24} />
        <h1>{t('loadingSandbox')}</h1>
        <p>{t('loadingSandboxBody')}</p>
      </main>
    )
  }

  if (!sandbox) {
    return (
      <main className="bootstrap-screen error-screen" role="alert">
        <span className="brand-mark">F</span>
        <h1>{t('sandboxUnavailable')}</h1>
        <p>{bootstrapError ?? t('sandboxUnavailableBody')}</p>
        <div className="hero-actions">
          <button
            className="primary-button"
            onClick={() => void retryBootstrap().catch(() => undefined)}
          >
            <RefreshCw size={17} /> {t('retry')}
          </button>
          <button
            className="secondary-button"
            onClick={() => void createFreshSandbox().catch(() => undefined)}
          >
            {t('newSandbox')}
          </button>
        </div>
      </main>
    )
  }

  return <Workspace />
}

function Workspace(): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const { sandbox, pendingAction, realtimeStatus, changeRole } = useSandbox()
  const view = useWorkspaceStore((state) => state.view)
  const theme = useWorkspaceStore((state) => state.theme)
  const setView = useWorkspaceStore((state) => state.setView)
  const toggleTheme = useWorkspaceStore((state) => state.toggleTheme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  if (!sandbox) throw new Error('The workspace requires an initialized sandbox.')

  const toggleLanguage = (): void => {
    void i18n.changeLanguage(i18n.language === 'de' ? 'en' : 'de')
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setView('dashboard')} aria-label={t('dashboard')}>
          <span className="brand-mark">F</span>
          <span className="brand-wordmark">
            <strong>{t('brand')}</strong>
            <small>{t('pro')}</small>
          </span>
        </button>

        <div className="sidebar-section-label">{t('navigation')}</div>
        <nav className="sidebar-nav" aria-label={t('navigation')}>
          {navigation.map((item) => {
            const Icon = item.icon
            return (
              <button
                className={view === item.id ? 'nav-button active' : 'nav-button'}
                key={item.id}
                onClick={() => setView(item.id)}
              >
                <Icon size={19} strokeWidth={1.9} />
                <span>{t(item.labelKey)}</span>
              </button>
            )
          })}
        </nav>

        <div className="sandbox-card">
          <div className="sandbox-icon">
            <ShieldCheck size={18} />
          </div>
          <div>
            <strong>{t('sandbox')}</strong>
            <span>{t('expiresInHours', { count: remainingHours(sandbox.expiresAt) })}</span>
            <code>{sandbox.id.slice(0, 8)}</code>
          </div>
          <span
            className={`realtime-dot ${realtimeStatus}`}
            title={t(`realtime.${realtimeStatus}`)}
          >
            {realtimeStatus === 'online' ? <Wifi size={13} /> : <WifiOff size={13} />}
          </span>
        </div>
      </aside>

      <div className="workspace-shell">
        <header className="topbar">
          <div className="topbar-context">
            <FileStack size={18} />
            <span>Expense approvals</span>
            <span className="context-separator">/</span>
            <strong>
              {t(navigation.find((item) => item.id === view)?.labelKey ?? 'dashboard')}
            </strong>
          </div>

          <div className="topbar-actions">
            <label className="role-switcher">
              <span>{t('role')}</span>
              <select
                value={sandbox.activeRole}
                disabled={Boolean(pendingAction)}
                onChange={(event) =>
                  void changeRole(event.target.value as ActorRole).catch(() => undefined)
                }
              >
                {roles.map((candidate) => (
                  <option value={candidate} key={candidate}>
                    {t(`roles.${candidate}`)}
                  </option>
                ))}
              </select>
            </label>
            <button className="icon-button" onClick={toggleLanguage} title={t('language')}>
              <Languages size={18} />
              <span>{i18n.language === 'de' ? 'DE' : 'EN'}</span>
            </button>
            <button className="icon-button compact" onClick={toggleTheme} title={t('theme')}>
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </header>

        <SyncNotice />
        <ActionNotice />

        <main className="workspace-main">
          <Suspense
            fallback={
              <div className="view-loading">
                <span /> {t('loadingWorkspace')}
              </div>
            }
          >
            <CurrentView />
          </Suspense>
        </main>

        <nav className="mobile-navigation" aria-label={t('navigation')}>
          {navigation.map((item) => {
            const Icon = item.icon
            return (
              <button
                className={view === item.id ? 'active' : ''}
                key={item.id}
                onClick={() => setView(item.id)}
              >
                <Icon size={19} />
                <span>{t(item.labelKey)}</span>
              </button>
            )
          })}
        </nav>
      </div>
    </div>
  )
}

function SyncNotice(): React.JSX.Element | null {
  const { t } = useTranslation()
  const { saveDraft, discardLocalDraft, keepLocalDraft } = useSandbox()
  const phase = useWorkspaceStore((state) => state.syncPhase)
  const message = useWorkspaceStore((state) => state.syncMessage)

  if (phase !== 'conflict' && phase !== 'error') return null
  return (
    <div className={`sync-notice ${phase}`} role="alert">
      <div>
        <strong>{phase === 'conflict' ? t('syncConflict') : t('syncError')}</strong>
        <span>{message}</span>
      </div>
      <div>
        {phase === 'conflict' ? (
          <>
            <button onClick={() => void discardLocalDraft().catch(() => undefined)}>
              {t('loadServerVersion')}
            </button>
            <button onClick={() => void keepLocalDraft().catch(() => undefined)}>
              {t('keepLocalVersion')}
            </button>
          </>
        ) : (
          <button onClick={() => void saveDraft().catch(() => undefined)}>{t('retrySave')}</button>
        )}
      </div>
    </div>
  )
}

function ActionNotice(): React.JSX.Element | null {
  const { t } = useTranslation()
  const { actionError, clearActionError } = useSandbox()
  if (!actionError) return null
  return (
    <div className="sync-notice error" role="alert">
      <div>
        <strong>{t('actionFailed')}</strong>
        <span>{actionError}</span>
      </div>
      <button onClick={clearActionError}>{t('dismiss')}</button>
    </div>
  )
}

function remainingHours(expiresAt: string): number {
  return Math.max(0, Math.ceil((Date.parse(expiresAt) - Date.now()) / 3_600_000))
}
