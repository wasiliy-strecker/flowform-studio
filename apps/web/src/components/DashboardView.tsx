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

import { useSandbox } from '../sandbox'
import { useWorkspaceStore } from '../store'

export function DashboardView(): React.JSX.Element {
  const { t } = useTranslation()
  const { sandbox, realtimeStatus } = useSandbox()
  const draft = useWorkspaceStore((state) => state.draft)
  const visitedViews = useWorkspaceStore((state) => state.visitedViews)
  const setView = useWorkspaceStore((state) => state.setView)

  if (!sandbox) return <div />
  const form = draft?.form ?? sandbox.form
  const workflow = draft?.workflow ?? sandbox.workflow
  const workflowState = sandbox.submission?.workflowState
  const publishedAt = sandbox.publishedVersion?.publishedAt
  const comments = sandbox.submission?.comments ?? []

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
          <ApiHealthBadge realtimeStatus={realtimeStatus} />
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
          value={`r${sandbox.revision}`}
          detail={t('metrics.publishedVersions', { count: sandbox.publishedVersionCount })}
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

function ApiHealthBadge({ realtimeStatus }: { realtimeStatus: string }): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <span className={realtimeStatus === 'online' ? 'api-health online' : 'api-health local'}>
      <span /> {realtimeStatus === 'online' ? t('apiOnline') : t('apiConnecting')}
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
