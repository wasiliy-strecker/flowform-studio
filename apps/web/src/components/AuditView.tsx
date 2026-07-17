import { Activity, CheckCircle2, Clock3, Database, Fingerprint, ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { useSandbox } from '../sandbox'

export function AuditView(): React.JSX.Element {
  const { t } = useTranslation()
  const { sandbox } = useSandbox()

  if (!sandbox) return <div />
  const entries = sandbox.audit
  const sandboxId = sandbox.id

  return (
    <div className="audit-view view-stack">
      <div className="view-toolbar">
        <div>
          <div className="eyebrow compact">AUDIT · APPEND ONLY</div>
          <h1>{t('auditTitle')}</h1>
          <p>{t('auditBody')}</p>
        </div>
        <span className="validation-chip valid">
          <ShieldCheck size={15} /> Sandbox isolated
        </span>
      </div>

      <section className="audit-summary-grid">
        <article>
          <Database size={19} />
          <div>
            <span>Recorded events</span>
            <strong>{entries.length}</strong>
          </div>
        </article>
        <article>
          <Fingerprint size={19} />
          <div>
            <span>Correlation</span>
            <strong>{sandboxId.slice(0, 8)}</strong>
          </div>
        </article>
        <article>
          <Clock3 size={19} />
          <div>
            <span>Retention</span>
            <strong>24 hours</strong>
          </div>
        </article>
      </section>

      <section className="surface-card audit-table-card">
        <div className="card-heading-row">
          <div>
            <span className="card-kicker">TRANSACTIONAL EVENTS</span>
            <h2>Activity stream</h2>
          </div>
          <Activity size={22} />
        </div>
        {entries.length === 0 ? (
          <div className="audit-empty">
            <Activity size={30} />
            <p>{t('auditEmpty')}</p>
          </div>
        ) : (
          <div className="audit-table" role="table">
            <div className="audit-table-header" role="row">
              <span>Event</span>
              <span>Actor</span>
              <span>Target</span>
              <span>Timestamp</span>
              <span>Integrity</span>
            </div>
            {entries.map((entry) => (
              <div className="audit-row" role="row" key={entry.id}>
                <div>
                  <span className="event-icon">
                    <Activity size={15} />
                  </span>
                  <code>{entry.action}</code>
                </div>
                <span className={`actor-chip ${entry.actorRole}`}>
                  {t(`roles.${entry.actorRole}`)}
                </span>
                <span title={entry.targetId}>{entry.targetId}</span>
                <time>{new Date(entry.occurredAt).toLocaleString()}</time>
                <span className="integrity-state">
                  <CheckCircle2 size={15} /> Recorded
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
