import type { ActorRole } from '@flowform/form-schema'
import {
  Activity,
  Blocks,
  ClipboardCheck,
  FileStack,
  Languages,
  LayoutDashboard,
  Moon,
  Network,
  ShieldCheck,
  Sun,
} from 'lucide-react'
import { lazy, Suspense, useEffect, type ComponentType } from 'react'
import { useTranslation } from 'react-i18next'

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
  const { t, i18n } = useTranslation()
  const view = useWorkspaceStore((state) => state.view)
  const role = useWorkspaceStore((state) => state.role)
  const theme = useWorkspaceStore((state) => state.theme)
  const sandboxId = useWorkspaceStore((state) => state.sandboxId)
  const setView = useWorkspaceStore((state) => state.setView)
  const setRole = useWorkspaceStore((state) => state.setRole)
  const toggleTheme = useWorkspaceStore((state) => state.toggleTheme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

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
            <span>{t('expires')}</span>
            <code>{sandboxId.slice(0, 8)}</code>
          </div>
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
              <select value={role} onChange={(event) => setRole(event.target.value as ActorRole)}>
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

        <main className="workspace-main">
          <Suspense
            fallback={
              <div className="view-loading">
                <span /> Loading workspace
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
