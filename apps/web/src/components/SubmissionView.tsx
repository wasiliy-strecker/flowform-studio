import type { StoredAttachment } from '@flowform/api-contracts'
import { isFieldVisible, validateAnswers, type FormField } from '@flowform/form-schema'
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Circle,
  Clock3,
  FileText,
  LoaderCircle,
  MessageSquareText,
  Paperclip,
  Send,
  ShieldCheck,
  UserRound,
} from 'lucide-react'
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { useSandbox } from '../sandbox'
import { useWorkspaceStore } from '../store'

export function SubmissionView(): React.JSX.Element {
  const { sandbox } = useSandbox()
  return sandbox?.submission ? <SubmissionReview /> : <PublicFormRuntime />
}

function PublicFormRuntime(): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const { sandbox, pendingAction, submitRequest, uploadAttachment } = useSandbox()
  const draft = useWorkspaceStore((state) => state.draft)
  const answers = useWorkspaceStore((state) => state.answers)
  const updateAnswers = useWorkspaceStore((state) => state.updateAnswers)
  const [pageIndex, setPageIndex] = useState(0)
  const [runtimeErrors, setRuntimeErrors] = useState<Record<string, string>>({})
  const [submitError, setSubmitError] = useState<string>()
  const form = draft?.form ?? sandbox?.form
  const {
    register,
    handleSubmit,
    getValues,
    setValue,
    watch,
    formState: { errors },
  } = useForm<Record<string, unknown>>({ defaultValues: answers })
  const currentAnswers = watch()
  const page = form?.pages[pageIndex]

  if (!sandbox || !form || !page) {
    return (
      <div className="view-loading">
        <span /> {t('loadingWorkspace')}
      </div>
    )
  }

  const validatePage = (): boolean => {
    const values = getValues()
    const allErrors = validateAnswers(form, values)
    const pageFieldIds = new Set(page.fields.map((field) => field.id))
    const pageErrors = Object.fromEntries(
      Object.entries(allErrors).filter(([id]) => pageFieldIds.has(id)),
    )
    setRuntimeErrors(pageErrors)
    return Object.keys(pageErrors).length === 0
  }

  const goNext = (): void => {
    if (!validatePage()) return
    updateAnswers(getValues())
    setPageIndex((current) => Math.min(current + 1, form.pages.length - 1))
  }

  const onSubmit = async (values: Record<string, unknown>): Promise<void> => {
    const nextErrors = validateAnswers(form, values)
    setRuntimeErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return
    updateAnswers(values)
    setSubmitError(undefined)
    try {
      await submitRequest(values)
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : t('submissionFailed'))
    }
  }

  return (
    <div className="runtime-view">
      <div className="public-form-shell">
        <div className="runtime-brand">
          <span className="brand-mark small">F</span>
          <div>
            <strong>FlowForm Studio</strong>
            <small>Secure public form · Demo sandbox</small>
          </div>
        </div>
        <div className="runtime-progress">
          <div>
            <span>{pageIndex + 1}</span>
            <strong>{localizedPageTitle(page.id, page.title, i18n.language)}</strong>
          </div>
          <div className="runtime-progress-track">
            <span style={{ width: `${((pageIndex + 1) / form.pages.length) * 100}%` }} />
          </div>
          <small>
            {pageIndex + 1} / {form.pages.length}
          </small>
        </div>

        <form className="public-form" onSubmit={(event) => void handleSubmit(onSubmit)(event)}>
          <div className="public-form-heading">
            <span className="form-icon large">
              <FileText size={22} />
            </span>
            <div>
              <div className="eyebrow compact">PUBLISHED FORM PREVIEW</div>
              <h1>{t('submitTitle')}</h1>
              <p>{t('submitBody')}</p>
            </div>
          </div>

          <div className="runtime-fields">
            {page.fields
              .filter((field) => isFieldVisible(field, currentAnswers))
              .map((field) => (
                <RuntimeField
                  field={field}
                  error={runtimeErrors[field.id] ?? errors[field.id]?.message?.toString()}
                  language={i18n.language}
                  register={register}
                  setValue={setValue}
                  uploadAttachment={uploadAttachment}
                  key={field.id}
                />
              ))}
          </div>

          {submitError && (
            <div className="inline-error" role="alert">
              <AlertCircle size={16} /> {submitError}
            </div>
          )}

          <div className="runtime-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() => setPageIndex((current) => Math.max(0, current - 1))}
              disabled={pageIndex === 0 || Boolean(pendingAction)}
            >
              <ArrowLeft size={17} /> {t('back')}
            </button>
            {pageIndex < form.pages.length - 1 ? (
              <button type="button" className="primary-button" onClick={goNext}>
                {t('next')} <ArrowRight size={17} />
              </button>
            ) : (
              <button type="submit" className="primary-button" disabled={Boolean(pendingAction)}>
                {pendingAction === 'submit' ? (
                  <LoaderCircle className="spin" size={17} />
                ) : (
                  <Send size={17} />
                )}{' '}
                {pendingAction === 'submit' ? t('submitting') : t('submitRequest')}
              </button>
            )}
          </div>
        </form>

        <div className="runtime-trust-row">
          <span>
            <ShieldCheck size={15} /> Isolated demo sandbox
          </span>
          <span>
            <Clock3 size={15} /> Automatic deletion after 24 hours
          </span>
          <span>
            <FileText size={15} /> Version-bound submission
          </span>
        </div>
      </div>
    </div>
  )
}

interface RuntimeFieldProps {
  field: FormField
  error: string | undefined
  language: string
  register: ReturnType<typeof useForm<Record<string, unknown>>>['register']
  setValue: ReturnType<typeof useForm<Record<string, unknown>>>['setValue']
  uploadAttachment: (file: File) => Promise<StoredAttachment>
}

function RuntimeField({
  field,
  error,
  language,
  register,
  setValue,
  uploadAttachment,
}: RuntimeFieldProps): React.JSX.Element {
  const { t } = useTranslation()
  const [uploading, setUploading] = useState(false)
  const [uploadName, setUploadName] = useState<string>()
  const [uploadError, setUploadError] = useState<string>()
  const label = localizedFieldLabel(field.id, field.label, language)
  const common = { ...register(field.id, { valueAsNumber: field.kind === 'number' }) }

  if (field.kind === 'section') {
    return (
      <div className="runtime-section">
        <h2>{label}</h2>
        <p>{field.description}</p>
      </div>
    )
  }

  const selectFile = async (file: File | undefined): Promise<void> => {
    if (!file) return
    setUploading(true)
    setUploadError(undefined)
    try {
      const attachment = await uploadAttachment(file)
      setValue(field.id, attachment.id, { shouldDirty: true, shouldValidate: true })
      setUploadName(attachment.originalName)
    } catch (uploadFailure) {
      setUploadError(uploadFailure instanceof Error ? uploadFailure.message : t('uploadFailed'))
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className={error || uploadError ? 'runtime-field invalid' : 'runtime-field'}>
      <label htmlFor={field.id}>
        {label}
        {field.required && <span className="required-mark">*</span>}
      </label>
      {field.description && (
        <small>{localizedDescription(field.id, field.description, language)}</small>
      )}
      {field.kind === 'text' ||
      field.kind === 'email' ||
      field.kind === 'number' ||
      field.kind === 'date' ? (
        <div className="input-with-adornment">
          {field.kind === 'number' && <span>€</span>}
          <input
            id={field.id}
            type={field.kind === 'number' ? 'number' : field.kind}
            placeholder={'placeholder' in field ? field.placeholder : undefined}
            {...common}
          />
        </div>
      ) : field.kind === 'textarea' ? (
        <textarea id={field.id} rows={5} placeholder={field.placeholder} {...common} />
      ) : field.kind === 'select' ? (
        <select id={field.id} {...common}>
          <option value="">Select an option</option>
          {field.options.map((option) => (
            <option value={option.value} key={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      ) : field.kind === 'multiSelect' ? (
        <select id={field.id} multiple {...common}>
          {field.options.map((option) => (
            <option value={option.value} key={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      ) : field.kind === 'checkbox' ? (
        <label className="runtime-checkbox">
          <input id={field.id} type="checkbox" {...common} />
          <span>
            <Check size={14} />
          </span>
          {field.confirmationLabel}
        </label>
      ) : field.kind === 'file' ? (
        <label className="runtime-upload" htmlFor={field.id}>
          {uploading ? <LoaderCircle className="spin" size={20} /> : <Paperclip size={20} />}
          <strong>{uploadName ?? t('chooseFile')}</strong>
          <small>{uploading ? t('uploadingFile') : t('fileNotice')}</small>
          <input
            id={field.id}
            type="file"
            accept={field.acceptedTypes.join(',')}
            disabled={uploading}
            onChange={(event) => void selectFile(event.target.files?.[0])}
          />
        </label>
      ) : field.kind === 'signature' ? (
        <SignaturePad
          id={field.id}
          onChange={(value) => setValue(field.id, value, { shouldValidate: true })}
        />
      ) : null}
      {field.kind === 'signature' && (
        <p className="signature-disclaimer">
          <AlertCircle size={14} /> {t('signatureDisclaimer')}
        </p>
      )}
      {(error || uploadError) && (
        <span className="field-error">
          <AlertCircle size={14} /> {uploadError ?? errorMessage(error ?? '', t)}
        </span>
      )}
    </div>
  )
}

function SignaturePad({
  id,
  onChange,
}: {
  id: string
  onChange: (value: string) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)

  const point = (event: ReactPointerEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const rectangle = event.currentTarget.getBoundingClientRect()
    return { x: event.clientX - rectangle.left, y: event.clientY - rectangle.top }
  }
  const start = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    drawing.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
    const context = event.currentTarget.getContext('2d')
    const current = point(event)
    context?.beginPath()
    context?.moveTo(current.x, current.y)
  }
  const move = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    if (!drawing.current) return
    const context = event.currentTarget.getContext('2d')
    const current = point(event)
    if (!context) return
    context.strokeStyle = '#7777f5'
    context.lineWidth = 2.5
    context.lineCap = 'round'
    context.lineTo(current.x, current.y)
    context.stroke()
  }
  const end = (): void => {
    drawing.current = false
    const canvas = canvasRef.current
    if (canvas) onChange(canvas.toDataURL('image/png'))
  }
  const clear = (): void => {
    const canvas = canvasRef.current
    canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
    onChange('')
  }
  return (
    <div className="signature-pad">
      <canvas
        ref={canvasRef}
        id={id}
        width={620}
        height={145}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        aria-label={t('drawConfirmation')}
      />
      <span>{t('drawConfirmation')}</span>
      <button type="button" onClick={clear}>
        {t('clear')}
      </button>
    </div>
  )
}

function SubmissionReview(): React.JSX.Element {
  const { t } = useTranslation()
  const { sandbox, pendingAction, performWorkflowAction } = useSandbox()

  if (!sandbox?.submission) return <div />
  const role = sandbox.activeRole
  const submission = sandbox.submission
  const answers = submission.answers
  const workflow = sandbox.submissionVersion?.workflow ?? sandbox.workflow
  const workflowState = submission.workflowState
  const comments = submission.comments
  const currentNode = workflow.nodes.find((node) => node.id === workflowState.currentNodeId)
  const canReview =
    workflowState.status === 'inReview' && currentNode?.type === 'review' && role === 'reviewer'
  const canRespond = workflowState.status === 'needsClarification' && role === 'applicant'
  const canManage =
    workflowState.status === 'inReview' && currentNode?.type === 'approval' && role === 'management'
  const action = (input: Parameters<typeof performWorkflowAction>[0]): void => {
    void performWorkflowAction(input).catch(() => undefined)
  }

  return (
    <div className="review-view view-stack">
      <div className="view-toolbar">
        <div>
          <div className="eyebrow compact">
            SUBMISSION · FF-{submission.id.slice(0, 6).toUpperCase()}
          </div>
          <h1>{t('reviewTitle')}</h1>
          <p>{t('reviewBody')}</p>
        </div>
        <span className={`status-pill ${workflowState.status}`}>
          {t(`status.${workflowState.status}`)}
        </span>
      </div>

      <div className="review-layout">
        <div className="review-main">
          <section className="surface-card request-summary">
            <div className="card-heading-row">
              <div>
                <span className="card-kicker">
                  {t('pinnedFormVersion', { version: submission.formVersion })}
                </span>
                <h2>{t('requestDetails')}</h2>
              </div>
              <FileText size={22} />
            </div>
            <dl className="answer-grid">
              <Answer label="Applicant" value={String(answers.applicantName)} />
              <Answer label="Email" value={String(answers.applicantEmail)} />
              <Answer
                label="Amount"
                value={new Intl.NumberFormat('de-DE', {
                  style: 'currency',
                  currency: 'EUR',
                }).format(Number(answers.amount))}
                accent
              />
              <Answer label="Category" value={String(answers.category)} />
              <Answer label="Business justification" value={String(answers.justification)} wide />
            </dl>
          </section>

          <section className="surface-card conversation-card">
            <div className="card-heading-row">
              <div>
                <span className="card-kicker">REALTIME THREAD</span>
                <h2>{t('conversation')}</h2>
              </div>
              <MessageSquareText size={22} />
            </div>
            <div className="comment-thread">
              {comments.length === 0 ? (
                <div className="empty-comments">
                  <MessageSquareText size={24} />
                  <p>{t('noComments')}</p>
                </div>
              ) : (
                comments.map((comment) => (
                  <article className={`comment ${comment.actorRole}`} key={comment.id}>
                    <span className="comment-avatar">
                      <UserRound size={17} />
                    </span>
                    <div>
                      <header>
                        <strong>{t(`roles.${comment.actorRole}`)}</strong>
                        <time>
                          {new Date(comment.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </time>
                      </header>
                      {comment.anchorFieldId && (
                        <span className="field-anchor"># Business justification</span>
                      )}
                      <p>{comment.message}</p>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        </div>

        <aside className="review-sidebar">
          <section className="surface-card action-card">
            <div className="role-action-heading">
              <span className={`role-dot ${role}`} />
              <div>
                <small>{t('role')}</small>
                <strong>{t(`roles.${role}`)}</strong>
              </div>
            </div>
            {workflowState.status === 'approved' ? (
              <div className="completed-callout">
                <CheckCircle2 size={30} />
                <strong>{t('completed')}</strong>
                <p>All required approvals are recorded.</p>
              </div>
            ) : canReview ? (
              <div className="action-stack">
                {comments.length === 0 && (
                  <button
                    className="secondary-button full"
                    disabled={Boolean(pendingAction)}
                    onClick={() =>
                      action({ type: 'requestClarification', message: t('clarifyPrompt') })
                    }
                  >
                    <MessageSquareText size={17} />
                    {t('requestClarification')}
                  </button>
                )}
                <button
                  className="primary-button full"
                  disabled={Boolean(pendingAction)}
                  onClick={() => action({ type: 'approve' })}
                >
                  <Check size={17} />
                  {t('approveOperations')}
                </button>
              </div>
            ) : canRespond ? (
              <button
                className="primary-button full"
                disabled={Boolean(pendingAction)}
                onClick={() => action({ type: 'resubmit', message: t('applicantResponse') })}
              >
                <Send size={17} />
                {t('resubmit')}
              </button>
            ) : canManage ? (
              <button
                className="primary-button full"
                disabled={Boolean(pendingAction)}
                onClick={() => action({ type: 'approve' })}
              >
                <ShieldCheck size={17} />
                {t('approveManagement')}
              </button>
            ) : (
              <div className="waiting-callout">
                <Clock3 size={22} />
                <p>{waitingMessage(workflowState.status, currentNode?.type, t)}</p>
              </div>
            )}
          </section>

          <section className="surface-card timeline-card">
            <div className="card-heading-row">
              <h2>{t('timeline')}</h2>
              <span>{workflowState.history.length}</span>
            </div>
            <ol className="workflow-timeline">
              {workflowState.history.map((entry, index) => (
                <li key={entry.id}>
                  <span className={index === workflowState.history.length - 1 ? 'active' : 'done'}>
                    {index === workflowState.history.length - 1 ? (
                      <Circle size={13} />
                    ) : (
                      <Check size={13} />
                    )}
                  </span>
                  <div>
                    <strong>{humanizeAction(entry.action)}</strong>
                    <small>
                      {t(`roles.${entry.actorRole}`)} ·{' '}
                      {new Date(entry.at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </small>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </div>
  )
}

function Answer({
  label,
  value,
  wide = false,
  accent = false,
}: {
  label: string
  value: string
  wide?: boolean
  accent?: boolean
}): React.JSX.Element {
  return (
    <div className={`${wide ? 'wide ' : ''}${accent ? 'accent' : ''}`}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

function waitingMessage(
  status: string,
  nodeType: string | undefined,
  t: (key: string) => string,
): string {
  if (status === 'needsClarification') return t('waitingApplicant')
  if (nodeType === 'approval') return t('waitingManagement')
  return t('waitingReviewer')
}

function humanizeAction(action: string): string {
  return action.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase())
}

function errorMessage(code: string, t: (key: string) => string): string {
  if (code === 'required') return t('valueRequired')
  if (code === 'email') return t('invalidEmail')
  if (code === 'minimum') return t('minimum')
  return code
}

const germanLabels: Record<string, string> = {
  intro: 'Ausgabendetails',
  applicantName: 'Name des Antragstellers',
  applicantEmail: 'Geschäftliche E-Mail',
  amount: 'Beantragter Betrag',
  category: 'Kategorie',
  justification: 'Geschäftliche Begründung',
  quote: 'Angebot oder Nachweis',
  confirmation: 'Bestätigung',
  signature: 'Gezeichnete Bestätigung',
}

function localizedFieldLabel(id: string, fallback: string, language: string): string {
  return language === 'de' ? (germanLabels[id] ?? fallback) : fallback
}

function localizedPageTitle(id: string, fallback: string, language: string): string {
  if (language !== 'de') return fallback
  return id === 'request-details' ? 'Antragsdetails' : 'Nachweise und Bestätigung'
}

function localizedDescription(id: string, fallback: string, language: string): string {
  if (language !== 'de') return fallback
  if (id === 'amount') return 'Anträge über 5.000 € benötigen eine Freigabe der Geschäftsleitung.'
  if (id === 'quote') {
    return 'Demo-Dateien werden mit dieser Sandbox gelöscht. Keine vertraulichen Inhalte hochladen.'
  }
  return fallback
}
