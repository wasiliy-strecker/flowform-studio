import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { FormField, FormFieldKind } from '@flowform/form-schema'
import {
  AlignLeft,
  CalendarDays,
  CheckSquare,
  ChevronDown,
  CircleUserRound,
  FileUp,
  GripVertical,
  Heading2,
  ListChecks,
  Mail,
  MousePointerClick,
  Redo2,
  Save,
  TextCursorInput,
  Trash2,
  Undo2,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { useSandbox } from '../sandbox'
import { useWorkspaceStore } from '../store'

const palette: Array<{ kind: FormFieldKind; icon: React.ComponentType<{ size?: number }> }> = [
  { kind: 'text', icon: TextCursorInput },
  { kind: 'textarea', icon: AlignLeft },
  { kind: 'email', icon: Mail },
  { kind: 'number', icon: MousePointerClick },
  { kind: 'select', icon: ChevronDown },
  { kind: 'multiSelect', icon: ListChecks },
  { kind: 'checkbox', icon: CheckSquare },
  { kind: 'date', icon: CalendarDays },
  { kind: 'file', icon: FileUp },
  { kind: 'signature', icon: CircleUserRound },
  { kind: 'section', icon: Heading2 },
]

export function FormBuilderView(): React.JSX.Element {
  const { t } = useTranslation()
  const { sandbox, publishDraft, pendingAction } = useSandbox()
  const draft = useWorkspaceStore((state) => state.draft)
  const pageIndex = useWorkspaceStore((state) => state.pageIndex)
  const selectedFieldId = useWorkspaceStore((state) => state.selectedFieldId)
  const syncPhase = useWorkspaceStore((state) => state.syncPhase)
  const past = useWorkspaceStore((state) => state.past)
  const future = useWorkspaceStore((state) => state.future)
  const setPageIndex = useWorkspaceStore((state) => state.setPageIndex)
  const selectField = useWorkspaceStore((state) => state.selectField)
  const addField = useWorkspaceStore((state) => state.addField)
  const moveField = useWorkspaceStore((state) => state.moveField)
  const updateSelectedField = useWorkspaceStore((state) => state.updateSelectedField)
  const deleteSelectedField = useWorkspaceStore((state) => state.deleteSelectedField)
  const undo = useWorkspaceStore((state) => state.undo)
  const redo = useWorkspaceStore((state) => state.redo)
  const setView = useWorkspaceStore((state) => state.setView)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  if (!draft || !sandbox)
    return (
      <div className="view-loading">
        <span /> {t('loadingWorkspace')}
      </div>
    )
  const form = draft.form
  const revision = draft.baseRevision
  const publishedRevision = sandbox.publishedVersion?.draftRevision

  const page = form.pages[pageIndex]
  const selectedField = form.pages
    .flatMap((candidate) => candidate.fields)
    .find((field) => field.id === selectedFieldId)
  const handleDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event
    if (!over || !page) return
    const source = active.data.current?.source as string | undefined
    if (source === 'palette') {
      const kind = active.data.current?.kind as FormFieldKind
      const index = page.fields.findIndex((field) => field.id === over.id)
      addField(kind, index < 0 ? undefined : index)
      return
    }
    moveField(String(active.id), String(over.id))
  }

  if (!page) return <div className="empty-state">No form page is available.</div>

  return (
    <div className="builder-view">
      <div className="view-toolbar builder-toolbar">
        <div>
          <div className="eyebrow compact">FORM · REVISION {revision}</div>
          <h1>{form.title}</h1>
        </div>
        <div className="toolbar-actions">
          <button
            className="icon-button compact"
            onClick={undo}
            disabled={past.length === 0}
            title={t('undo')}
          >
            <Undo2 size={17} />
          </button>
          <button
            className="icon-button compact"
            onClick={redo}
            disabled={future.length === 0}
            title={t('redo')}
          >
            <Redo2 size={17} />
          </button>
          <button className="secondary-button small" onClick={() => setView('submission')}>
            {t('preview')}
          </button>
          <button
            className="primary-button small"
            onClick={() => void publishDraft().catch(() => undefined)}
            disabled={pendingAction === 'publish' || syncPhase === 'conflict'}
          >
            <Save size={16} />
            {pendingAction === 'publish'
              ? t('publishing')
              : publishedRevision === revision
                ? t('published')
                : t('publish')}
          </button>
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div className="builder-grid">
          <aside className="builder-panel palette-panel">
            <div className="panel-heading">
              <h2>{t('palette')}</h2>
              <p>{t('paletteHint')}</p>
            </div>
            <div className="palette-grid">
              {palette.map((item) => (
                <PaletteItem
                  kind={item.kind}
                  icon={item.icon}
                  label={t(`fields.${item.kind}`)}
                  onAdd={() => addField(item.kind)}
                  key={item.kind}
                />
              ))}
            </div>
          </aside>

          <section className="builder-canvas-panel">
            <div className="canvas-header">
              <div>
                <span>{t('canvas')}</span>
                <strong>{page.title}</strong>
              </div>
              <span className="autosave-indicator">
                <span /> {t(`sync.${syncPhase}`)} · revision {revision}
              </span>
            </div>
            <div className="page-tabs" aria-label={t('pages')}>
              {form.pages.map((candidate, index) => (
                <button
                  className={index === pageIndex ? 'active' : ''}
                  onClick={() => setPageIndex(index)}
                  key={candidate.id}
                >
                  <span>{index + 1}</span>
                  {candidate.title}
                </button>
              ))}
            </div>

            <div className="form-canvas">
              <div className="canvas-form-heading">
                <span className="form-icon">
                  <FileUp size={19} />
                </span>
                <div>
                  <h2>{form.title}</h2>
                  <p>{page.description ?? form.description}</p>
                </div>
              </div>
              <SortableContext
                items={page.fields.map((field) => field.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="sortable-fields">
                  {page.fields.map((field) => (
                    <SortableField
                      field={field}
                      selected={selectedFieldId === field.id}
                      onSelect={() => selectField(field.id)}
                      key={field.id}
                    />
                  ))}
                </div>
              </SortableContext>
              <button className="canvas-add-button" onClick={() => addField('text')}>
                + {t('addElement', { element: t('fields.text') })}
              </button>
            </div>
          </section>

          <aside className="builder-panel properties-panel">
            <div className="panel-heading">
              <h2>{t('properties')}</h2>
              {selectedField && <span className="selection-badge">{t('selected')}</span>}
            </div>
            {selectedField ? (
              <div className="property-form">
                <div className="property-type">
                  <span>{t(`fields.${selectedField.kind}`)}</span>
                  <code>{selectedField.id}</code>
                </div>
                <label>
                  <span>{t('fieldLabel')}</span>
                  <input
                    value={selectedField.label}
                    onChange={(event) => updateSelectedField({ label: event.target.value })}
                  />
                </label>
                <label>
                  <span>{t('description')}</span>
                  <textarea
                    value={selectedField.description ?? ''}
                    rows={4}
                    onChange={(event) => updateSelectedField({ description: event.target.value })}
                  />
                </label>
                {selectedField.kind !== 'section' && (
                  <label className="toggle-row">
                    <div>
                      <strong>{t('required')}</strong>
                      <small>Runtime and publish validation</small>
                    </div>
                    <input
                      type="checkbox"
                      checked={selectedField.required}
                      onChange={(event) => updateSelectedField({ required: event.target.checked })}
                    />
                  </label>
                )}
                <div className="rule-preview">
                  <div>
                    <GitBranchIcon />
                    <span>Visibility</span>
                  </div>
                  <strong>Always visible</strong>
                  <small>Rules use a typed condition tree</small>
                </div>
                <button className="danger-button" onClick={deleteSelectedField}>
                  <Trash2 size={16} />
                  {t('deleteField')}
                </button>
              </div>
            ) : (
              <div className="empty-properties">
                <MousePointerClick size={26} />
                <p>{t('selectField')}</p>
              </div>
            )}
          </aside>
        </div>
      </DndContext>
    </div>
  )
}

function PaletteItem({
  kind,
  icon: Icon,
  label,
  onAdd,
}: {
  kind: FormFieldKind
  icon: React.ComponentType<{ size?: number }>
  label: string
  onAdd: () => void
}): React.JSX.Element {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `palette-${kind}`,
    data: { source: 'palette', kind },
  })
  return (
    <button
      ref={setNodeRef}
      className={isDragging ? 'palette-item dragging' : 'palette-item'}
      style={{ transform: CSS.Translate.toString(transform) }}
      onClick={onAdd}
      {...listeners}
      {...attributes}
    >
      <Icon size={18} />
      <span>{label}</span>
      <GripVertical size={14} />
    </button>
  )
}

function SortableField({
  field,
  selected,
  onSelect,
}: {
  field: FormField
  selected: boolean
  onSelect: () => void
}): React.JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: field.id,
  })
  const style = { transform: CSS.Transform.toString(transform), transition }
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`field-card ${selected ? 'selected' : ''} ${isDragging ? 'dragging' : ''}`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onSelect()
      }}
    >
      <button
        className="drag-handle"
        {...attributes}
        {...listeners}
        aria-label={`Move ${field.label}`}
      >
        <GripVertical size={17} />
      </button>
      <div className="field-preview">
        {field.kind === 'section' ? (
          <div className="section-preview">
            <h3>{field.label}</h3>
            <p>{field.description}</p>
          </div>
        ) : (
          <>
            <label>
              {field.label}
              {field.required && <span className="required-mark">*</span>}
            </label>
            {field.description && <small>{field.description}</small>}
            <FieldControl field={field} />
          </>
        )}
      </div>
      {selected && <span className="selected-tag">Selected</span>}
    </div>
  )
}

function FieldControl({ field }: { field: FormField }): React.JSX.Element {
  switch (field.kind) {
    case 'text':
    case 'email':
    case 'number':
    case 'date':
      return (
        <input disabled placeholder={'placeholder' in field ? field.placeholder : field.kind} />
      )
    case 'textarea':
      return <textarea disabled rows={3} placeholder={field.placeholder} />
    case 'select':
    case 'multiSelect':
      return (
        <div className="fake-select">
          Select an option <ChevronDown size={16} />
        </div>
      )
    case 'checkbox':
      return (
        <div className="fake-checkbox">
          <span /> {field.confirmationLabel}
        </div>
      )
    case 'file':
      return (
        <div className="fake-upload">
          <FileUp size={17} /> Drop a PDF or image here
        </div>
      )
    case 'signature':
      return <div className="fake-signature">Drawn confirmation</div>
    case 'section':
      return <div />
  }
}

function GitBranchIcon(): React.JSX.Element {
  return <span className="tiny-rule-icon">IF</span>
}
