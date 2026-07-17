import { FlowFormApiClient } from '@flowform/api-client'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  Braces,
  Check,
  CheckCircle2,
  Circle,
  GitBranch,
  MousePointer2,
  Sparkles,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { useWorkspaceStore } from '../store'

export function DashboardView(): React.JSX.Element {
  const { t } = useTranslation()
  const form = useWorkspaceStore((state) => state.form)
  const workflow = useWorkspaceStore((state) => state.workflow)
  const revision = useWorkspaceStore((state) => state.revision)
  const publishedAt = useWorkspaceStore((state) => state.publishedAt)
  const workflowState = useWorkspaceStore((state) => state.workflowState)
  const comments = useWorkspaceStore((state) => state.comments)
  const visitedViews = useWorkspaceStore((state) => state.visitedViews)
  const setView = useWorkspaceStore((state) => state.setView)

  const steps = [
    { key: 'edit', done: visitedViews.includes('builder') },
    { key: 'workflow', done: visitedViews.includes('workflow') },
    { key: 'publish', done: Boolean(publishedAt) },
    { key: 'submit', done: Boolean(workflowState) },
    { key: 'clarify', done: comments.length > 0 },
    { key: 'approve', done: workflowState?.status === 'approved' },
  ]
  const done = steps.filter((step) => step.done).length
  const fields = form.pages.reduce((total, page) => total + page.fields.length, 0)

  return (
    <div className="dashboard-view view-stack">
      <section className="hero-panel">
        <div className="hero-copy">
          <div className="eyebrow">
            <Sparkles size={15} />
            {t('welcomeEyebrow')}
          </div>
          <ApiHealthBadge />
          <h1>{t('welcomeTitle')}</h1>
          <p>{t('welcomeBody')}</p>
          <div className="hero-actions">
            <button className="primary-button" onClick={() => setView('builder')}>
              {t('openBuilder')}
              <ArrowRight size={17} />
            </button>
            <button className="secondary-button" onClick={() => setView('submission')}>
              {t('launchSubmission')}
            </button>
          </div>
        </div>
        <div className="hero-visual" aria-hidden="true">
          <div className="visual-glow" />
          <div className="mini-flow-card start-card">
            <MousePointer2 size={15} />
            <span>Submit</span>
          </div>
          <div className="mini-flow-line line-one" />
          <div className="mini-flow-card review-card">
            <Check size={15} />
            <span>Review</span>
          </div>
          <div className="mini-flow-line line-two" />
          <div className="mini-flow-card decision-card">
            <GitBranch size={15} />
            <span>&gt; €5k</span>
          </div>
          <div className="mini-flow-line line-three" />
          <div className="mini-flow-card done-card">
            <CheckCircle2 size={15} />
            <span>Approved</span>
          </div>
        </div>
      </section>

      <section className="metric-grid">
        <Metric
          label={t('metrics.formVersion')}
          value={`v0.${revision}`}
          detail={publishedAt ? t('published') : t('status.draft')}
        />
        <Metric
          label={t('metrics.fields')}
          value={String(fields)}
          detail="Zod discriminated union"
        />
        <Metric
          label={t('metrics.workflowNodes')}
          value={String(workflow.nodes.length)}
          detail="Typed graph"
        />
        <Metric
          label={t('metrics.status')}
          value={t(`status.${workflowState?.status ?? 'draft'}`)}
          detail={workflowState?.currentNodeId ?? 'Builder ready'}
          accent
        />
      </section>

      <section className="dashboard-grid">
        <article className="surface-card guided-card">
          <div className="card-heading-row">
            <div>
              <span className="card-kicker">PRO WORKFLOW</span>
              <h2>{t('guidedFlow')}</h2>
            </div>
            <div className="progress-orb">{Math.round((done / steps.length) * 100)}%</div>
          </div>
          <div className="progress-track">
            <span style={{ width: `${(done / steps.length) * 100}%` }} />
          </div>
          <p className="muted-copy">{t('completion', { done, total: steps.length })}</p>
          <ol className="guided-steps">
            {steps.map((step, index) => (
              <li className={step.done ? 'done' : ''} key={step.key}>
                {step.done ? <CheckCircle2 size={19} /> : <Circle size={19} />}
                <span className="step-number">0{index + 1}</span>
                <span>{t(`steps.${step.key}`)}</span>
              </li>
            ))}
          </ol>
        </article>

        <article className="surface-card signals-card">
          <div className="card-heading-row">
            <div>
              <span className="card-kicker">ENGINEERING</span>
              <h2>{t('recentActivity')}</h2>
            </div>
            <Braces size={22} />
          </div>
          <ul className="signal-list">
            <li>
              <span className="signal-icon violet">TS</span>
              <div>
                <strong>{t('signalOne')}</strong>
                <small>@flowform/form-schema</small>
              </div>
            </li>
            <li>
              <span className="signal-icon aqua">IF</span>
              <div>
                <strong>{t('signalTwo')}</strong>
                <small>amount &gt; 5,000</small>
              </div>
            </li>
            <li>
              <span className="signal-icon amber">01</span>
              <div>
                <strong>{t('signalThree')}</strong>
                <small>transactional audit outbox</small>
              </div>
            </li>
          </ul>
        </article>
      </section>
    </div>
  )
}

function ApiHealthBadge(): React.JSX.Element | null {
  const { t } = useTranslation()
  const query = useQuery({
    queryKey: ['api-health'],
    queryFn: () => new FlowFormApiClient().health(),
    enabled: import.meta.env.MODE !== 'test',
    retry: false,
  })
  if (import.meta.env.MODE === 'test') return null
  return (
    <span className={query.isSuccess ? 'api-health online' : 'api-health local'}>
      <span /> {query.isSuccess ? t('apiOnline') : t('apiLocal')}
    </span>
  )
}

function Metric({
  label,
  value,
  detail,
  accent = false,
}: {
  label: string
  value: string
  detail: string
  accent?: boolean
}): React.JSX.Element {
  return (
    <article className={accent ? 'metric-card accent' : 'metric-card'}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  )
}
