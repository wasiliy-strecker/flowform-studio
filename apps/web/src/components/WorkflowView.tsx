import type { ActorRole } from '@flowform/form-schema'
import { validateWorkflow, type WorkflowNodeType } from '@flowform/workflow-schema'
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Check, GitBranch, Play, ShieldCheck, UserRoundCheck } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { useSandbox } from '../sandbox'
import { useWorkspaceStore } from '../store'

interface StudioNodeData extends Record<string, unknown> {
  label: string
  nodeType: WorkflowNodeType
  assigneeRole?: ActorRole
  outcome?: 'approved' | 'rejected'
}

type StudioNode = Node<StudioNodeData, 'studio'>

const nodeTypes = { studio: StudioWorkflowNode }

export function WorkflowView(): React.JSX.Element {
  const { t } = useTranslation()
  const { sandbox, publishDraft, pendingAction } = useSandbox()
  const draft = useWorkspaceStore((state) => state.draft)
  const workflow = draft?.workflow ?? sandbox?.workflow
  const selectedNodeId = useWorkspaceStore((state) => state.selectedWorkflowNodeId)
  const selectNode = useWorkspaceStore((state) => state.selectWorkflowNode)
  const updatePosition = useWorkspaceStore((state) => state.updateWorkflowNodePosition)
  const issues = workflow ? validateWorkflow(workflow) : []

  const nodes = useMemo<StudioNode[]>(
    () =>
      (workflow?.nodes ?? []).map((node) => ({
        id: node.id,
        type: 'studio',
        position: node.position,
        selected: selectedNodeId === node.id,
        data: {
          label: node.data.label,
          nodeType: node.type,
          ...('assigneeRole' in node.data ? { assigneeRole: node.data.assigneeRole } : {}),
          ...('outcome' in node.data ? { outcome: node.data.outcome } : {}),
        },
      })),
    [selectedNodeId, workflow?.nodes],
  )

  const edges = useMemo<Edge[]>(
    () =>
      (workflow?.edges ?? []).map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label,
        animated: edge.condition !== undefined,
        markerEnd: { type: MarkerType.ArrowClosed, color: '#8a8d9d' },
        style: {
          stroke: edge.condition ? '#7777f5' : '#777b8f',
          strokeWidth: edge.condition ? 2.2 : 1.7,
        },
        labelStyle: { fill: '#9b9fb3', fontWeight: 700, fontSize: 11 },
        labelBgStyle: { fill: '#151722', fillOpacity: 0.94 },
      })),
    [workflow?.edges],
  )

  const selectedNode = workflow?.nodes.find((node) => node.id === selectedNodeId)

  if (!workflow)
    return (
      <div className="view-loading">
        <span /> {t('loadingWorkspace')}
      </div>
    )

  return (
    <div className="workflow-view view-stack">
      <div className="view-toolbar">
        <div>
          <div className="eyebrow compact">WORKFLOW · SCHEMA v{workflow.schemaVersion}</div>
          <h1>{t('workflowTitle')}</h1>
          <p>{t('workflowBody')}</p>
        </div>
        <button
          className="primary-button small"
          onClick={() => void publishDraft().catch(() => undefined)}
          disabled={pendingAction === 'publish'}
        >
          <ShieldCheck size={16} />
          {pendingAction === 'publish' ? t('publishing') : t('publish')}
        </button>
      </div>

      <div className="workflow-status-row">
        <span className={issues.length === 0 ? 'validation-chip valid' : 'validation-chip invalid'}>
          {issues.length === 0 ? <Check size={15} /> : <span>!</span>}
          {issues.length === 0 ? t('validWorkflow') : issues[0]?.message}
        </span>
        <code>amount &gt; 5000 → management</code>
      </div>

      <div className="workflow-layout">
        <section className="flow-canvas">
          <ReactFlow<StudioNode, Edge>
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.22 }}
            minZoom={0.55}
            maxZoom={1.6}
            onNodeClick={(_, node) => selectNode(node.id)}
            onNodeDragStop={(_, node) => updatePosition(node.id, node.position)}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#3a3d4c" gap={24} size={1} />
            <Controls showInteractive={false} />
            <MiniMap
              pannable
              zoomable
              nodeColor={(node) => (node.data.nodeType === 'end' ? '#37b88b' : '#6667d9')}
              maskColor="rgba(8, 9, 16, 0.72)"
            />
          </ReactFlow>
        </section>

        <aside className="workflow-inspector surface-card">
          <div className="panel-heading">
            <h2>{t('nodeInspector')}</h2>
            {selectedNode && <span className="selection-badge">{t('selected')}</span>}
          </div>
          {selectedNode ? (
            <div className="node-properties">
              <div className={`large-node-icon ${selectedNode.type}`}>
                <NodeIcon type={selectedNode.type} />
              </div>
              <h3>{selectedNode.data.label}</h3>
              <label>
                <span>{t('nodeType')}</span>
                <strong>{selectedNode.type}</strong>
              </label>
              {'assigneeRole' in selectedNode.data && (
                <label>
                  <span>{t('assignedRole')}</span>
                  <strong>{t(`roles.${selectedNode.data.assigneeRole}`)}</strong>
                </label>
              )}
              {selectedNode.type === 'decision' && (
                <div className="condition-card">
                  <span>IF</span>
                  <div>
                    <strong>{t('decisionRule')}</strong>
                    <small>typed RuleGroup</small>
                  </div>
                </div>
              )}
              <div className="coordinates">
                <span>x {Math.round(selectedNode.position.x)}</span>
                <span>y {Math.round(selectedNode.position.y)}</span>
              </div>
            </div>
          ) : (
            <div className="empty-properties">
              <GitBranch size={26} />
              <p>Select a workflow node</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

function StudioWorkflowNode({ data, selected }: NodeProps<StudioNode>): React.JSX.Element {
  return (
    <div className={`studio-node ${data.nodeType} ${selected ? 'selected' : ''}`}>
      {data.nodeType !== 'start' && <Handle type="target" position={Position.Left} />}
      <div className="studio-node-icon">
        <NodeIcon type={data.nodeType} />
      </div>
      <div>
        <strong>{data.label}</strong>
        <small>{nodeSubtitle(data)}</small>
      </div>
      {data.nodeType !== 'end' && <Handle type="source" position={Position.Right} />}
    </div>
  )
}

function NodeIcon({ type }: { type: WorkflowNodeType }): React.JSX.Element {
  switch (type) {
    case 'start':
      return <Play size={16} fill="currentColor" />
    case 'review':
      return <UserRoundCheck size={17} />
    case 'approval':
      return <ShieldCheck size={17} />
    case 'decision':
      return <GitBranch size={17} />
    case 'end':
      return <Check size={18} />
  }
}

function nodeSubtitle(data: StudioNodeData): string {
  if (data.assigneeRole) return data.assigneeRole
  if (data.nodeType === 'decision') return 'typed condition'
  if (data.outcome) return data.outcome
  return 'workflow trigger'
}
