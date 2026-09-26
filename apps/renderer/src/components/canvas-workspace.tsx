import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import {
  Background,
  BackgroundVariant,
  ControlButton,
  Controls,
  MiniMap,
  ReactFlow,
  type Edge,
  type NodeChange,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Copy,
  FolderPlus,
  ImagePlus,
  Map,
  MessageSquarePlus,
  Redo2,
  Scan,
  Trash2,
  Undo2,
  Ungroup,
  Video,
} from 'lucide-react';
import type { GraphEnvelope } from '@ilmheg/contracts';
import { Button } from '@/components/ui/button';
import { MediaViewerDialog, type MediaViewerTarget } from '@/components/media-viewer-dialog';
import { CanvasNodeCreationMenu, NodeCreationMenu } from '@/components/node-creation-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { nodeTypes, type CanvasFlowNode } from '@/components/nodes/canvas-nodes';
import { useNodeConnectionInteraction } from '@/hooks/use-node-connection-interaction';
import { applyNodeGeometryChanges } from '@/lib/flow-changes';
import { canvasNodeFlowSize } from '@/lib/flow-node-layout';
import { isInteractiveTarget, isTextEditingTarget } from '@/lib/keyboard-shortcuts';
import { connectionTargetHandle, type ConnectionGesture, type ExecutableNodeKind } from '@/lib/node-connections';
import { nodePreviewAssetId } from '@/lib/node-preview';
import { useCanvasStore } from '@/store/canvas-store';

export function CanvasWorkspace() {
  const graph = useCanvasStore((state) => state.graph);
  const assets = useCanvasStore((state) => state.assets);
  const runs = useCanvasStore((state) => state.runs);
  const selectedNodeIds = useCanvasStore((state) => state.selectedNodeIds);
  const selectedEdgeId = useCanvasStore((state) => state.selectedEdgeId);
  const preview = useCanvasStore((state) => state.preview);
  const finalizeGesture = useCanvasStore((state) => state.finalizeGesture);
  const connect = useCanvasStore((state) => state.connect);
  const addConnectedNode = useCanvasStore((state) => state.addConnectedNode);
  const select = useCanvasStore((state) => state.select);
  const removeEdge = useCanvasStore((state) => state.removeEdge);
  const setViewport = useCanvasStore((state) => state.setViewport);
  const [instance, setInstance] = useState<ReactFlowInstance<CanvasFlowNode, Edge> | null>(null);
  const [miniMapVisible, setMiniMapVisible] = useState(true);
  const [mediaViewerTarget, setMediaViewerTarget] = useState<MediaViewerTarget | null>(null);
  const [canvasMenu, setCanvasMenu] = useState<{
    position: { x: number; y: number };
    flowPosition: { x: number; y: number };
  } | null>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const gestureStart = useRef<GraphEnvelope | null>(null);
  const connection = useNodeConnectionInteraction({
    workspaceRef,
    instance,
    projectId: graph?.projectId,
    connect,
    addConnectedNode,
  });

  const selectNode = useCallback((nodeId: string, additive: boolean) => {
    const current = useCanvasStore.getState().selectedNodeIds;
    if (additive) {
      select(current.includes(nodeId) ? current.filter((id) => id !== nodeId) : [...current, nodeId]);
      return;
    }
    select([nodeId]);
  }, [select]);

  const closeCanvasMenu = useCallback(() => setCanvasMenu(null), []);

  const openCanvasMenu = useCallback((event: MouseEvent | ReactMouseEvent) => {
    event.preventDefault();
    const bounds = workspaceRef.current?.getBoundingClientRect();
    if (!bounds || !instance) return;
    const width = 220;
    const height = 190;
    connection.close();
    select([]);
    setCanvasMenu({
      flowPosition: instance.screenToFlowPosition({ x: event.clientX, y: event.clientY }),
      position: {
        x: Math.max(12, Math.min(bounds.width - width - 12, event.clientX - bounds.left)),
        y: Math.max(12, Math.min(bounds.height - height - 12, event.clientY - bounds.top)),
      },
    });
  }, [connection.close, instance, select]);

  const createFromCanvasMenu = useCallback((kind: ExecutableNodeKind) => {
    if (!canvasMenu) return;
    useCanvasStore.getState().addNode(kind, canvasMenu.flowPosition);
    setCanvasMenu(null);
  }, [canvasMenu]);

  const nodes = useMemo<CanvasFlowNode[]>(() => {
    if (!graph) return [];
    return [...graph.nodes].sort((a, b) => Number(a.kind !== 'group') - Number(b.kind !== 'group')).map((node) => {
      const assetId = nodePreviewAssetId(node);
      const run = runs.find((item) => item.nodeId === node.id);
      const size = canvasNodeFlowSize(node);
      return {
        id: node.id,
        type: node.kind,
        position: node.position,
        parentId: node.parentId,
        extent: node.parentId ? 'parent' as const : undefined,
        selected: selectedNodeIds.includes(node.id),
        draggable: node.kind !== 'group' || !node.parentId,
        width: size.width,
        height: size.height,
        zIndex: node.kind === 'group' ? -1 : 2,
        data: {
          canvasNode: node,
          asset: assetId ? assets[assetId] : undefined,
          run,
          connectionGesture: connection.gesture,
          selectNode,
          beginConnection: connection.begin,
          viewMedia: setMediaViewerTarget,
        },
      };
    });
  }, [graph, assets, runs, selectedNodeIds, connection.gesture, connection.begin, selectNode]);

  const edges = useMemo<Edge[]>(() => graph?.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: 'output',
    targetHandle: connectionTargetHandle(edge.binding),
    type: 'default',
    pathOptions: { curvature: .42 },
    selected: selectedEdgeId === edge.id,
  })) ?? [], [graph?.edges, selectedEdgeId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTextEditingTarget(event.target)) return;
      const command = event.metaKey || event.ctrlKey;
      const actions = useCanvasStore.getState();
      if (event.key === 'Escape') { connection.close(); closeCanvasMenu(); }
      else if (event.code === 'Space' && !event.repeat && !command && !event.shiftKey && !event.altKey && !isInteractiveTarget(event.target)) {
        event.preventDefault();
        if (instance) void instance.fitView({ padding: .3, duration: 350 });
      }
      else if (event.key === 'Backspace' || event.key === 'Delete') { event.preventDefault(); actions.removeSelected(); }
      else if (command && event.key.toLowerCase() === 'z' && event.shiftKey) { event.preventDefault(); actions.redo(); }
      else if (command && event.key.toLowerCase() === 'z') { event.preventDefault(); actions.undo(); }
      else if (command && event.key.toLowerCase() === 'c') { event.preventDefault(); actions.copySelected(); }
      else if (command && event.key.toLowerCase() === 'v') { event.preventDefault(); actions.paste(); }
      else if (command && event.key.toLowerCase() === 'd') { event.preventDefault(); actions.duplicateSelected(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeCanvasMenu, connection.close, instance]);

  useEffect(() => closeCanvasMenu(), [closeCanvasMenu, graph?.projectId]);

  useEffect(() => {
    if (!canvasMenu) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('[data-canvas-context-menu]')) return;
      closeCanvasMenu();
    };
    window.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => window.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, [canvasMenu, closeCanvasMenu]);

  const onNodesChange = useCallback((changes: NodeChange<CanvasFlowNode>[]) => {
    preview((current) => applyNodeGeometryChanges(current, changes));
    if (changes.some((change) => change.type === 'position' && change.dragging === false) && gestureStart.current) {
      finalizeGesture(gestureStart.current);
      gestureStart.current = null;
    }
  }, [finalizeGesture, preview]);

  const onSelectionChange = useCallback(({ nodes: selected, edges: selectedEdges }: { nodes: CanvasFlowNode[]; edges: Edge[] }) => {
    select(selected.map((node) => node.id), selectedEdges[0]?.id);
  }, [select]);

  if (!graph) return <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">正在打开画布…</div>;

  return <div ref={workspaceRef} className="relative h-full min-w-0 flex-1 canvas-grid">
    <ReactFlow<CanvasFlowNode, Edge>
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onInit={setInstance}
      onNodesChange={onNodesChange}
      onNodeDragStart={() => { gestureStart.current = structuredClone(useCanvasStore.getState().graph!); }}
      onSelectionChange={onSelectionChange}
      onEdgeClick={(_event, edge) => select([], edge.id)}
      onEdgesDelete={(deleted) => deleted.forEach((edge) => removeEdge(edge.id))}
      onPaneClick={() => { connection.close(); closeCanvasMenu(); select([]); }}
      onPaneContextMenu={openCanvasMenu}
      onMoveEnd={(_event, viewport) => setViewport(viewport)}
      defaultViewport={graph.viewport}
      minZoom={0.15}
      maxZoom={2.5}
      selectionOnDrag
      panOnDrag={[1, 2]}
      nodesConnectable={false}
      multiSelectionKeyCode="Shift"
      deleteKeyCode={null}
      fitViewOptions={{ padding: .3 }}
    >
      <Background variant={BackgroundVariant.Dots} color="hsl(var(--canvas-dot))" gap={24} size={1} />
      <Controls position="bottom-left" showInteractive={false}>
        <ControlButton
          onClick={() => setMiniMapVisible((visible) => !visible)}
          aria-label={miniMapVisible ? '隐藏小地图' : '显示小地图'}
          aria-pressed={miniMapVisible}
          title={miniMapVisible ? '隐藏小地图' : '显示小地图'}
          className={miniMapVisible ? '!bg-accent !text-accent-foreground' : undefined}
        ><Map className="h-4 w-4 fill-none" /></ControlButton>
      </Controls>
      {miniMapVisible ? <MiniMap
        position="bottom-left"
        style={{ left: 52, right: 'auto', bottom: 12 }}
        pannable
        zoomable
        ariaLabel="画布小地图"
        bgColor="hsl(var(--card))"
        maskColor="hsl(var(--minimap-mask) / .72)"
        maskStrokeColor="hsl(var(--minimap-mask-stroke))"
        maskStrokeWidth={1}
        nodeBorderRadius={6}
        nodeStrokeWidth={1.5}
        nodeStrokeColor={(node) => node.selected ? '#f97316' : 'hsl(var(--minimap-node-stroke))'}
        nodeColor={(node) => node.type === 'prompt' ? 'hsl(var(--minimap-node-prompt))' : node.type === 'image' ? 'hsl(var(--minimap-node-image))' : node.type === 'video' ? 'hsl(var(--minimap-node-video))' : 'hsl(var(--minimap-node-group))'}
      /> : null}
    </ReactFlow>
    <ConnectionPreview gesture={connection.gesture} />
    <CanvasToolbar instance={instance} />
    {connection.menu ? <NodeCreationMenu menu={connection.menu} onCreate={connection.createFromMenu} onClose={connection.close} /> : null}
    {canvasMenu ? <CanvasNodeCreationMenu position={canvasMenu.position} onCreate={createFromCanvasMenu} onClose={closeCanvasMenu} /> : null}
    <MediaViewerDialog target={mediaViewerTarget} onOpenChange={(open) => { if (!open) setMediaViewerTarget(null); }} />
  </div>;
}

function ConnectionPreview({ gesture }: { gesture: ConnectionGesture | null }) {
  if (!gesture?.started) return null;
  const direction = gesture.side === 'right' ? 1 : -1;
  const distance = Math.abs(gesture.current.x - gesture.start.x);
  const curve = Math.max(64, distance * .45);
  const path = [
    `M ${gesture.start.x} ${gesture.start.y}`,
    `C ${gesture.start.x + direction * curve} ${gesture.start.y}`,
    `${gesture.current.x - direction * curve * .55} ${gesture.current.y}`,
    `${gesture.current.x} ${gesture.current.y}`,
  ].join(' ');
  return <svg className="pointer-events-none absolute inset-0 z-20 h-full w-full overflow-visible" aria-hidden="true">
    <path d={path} fill="none" stroke="#f97316" strokeWidth="1.75" strokeLinecap="round" />
    <circle cx={gesture.current.x} cy={gesture.current.y} r="4" fill="hsl(var(--card))" stroke="#f97316" strokeWidth="1.5" />
  </svg>;
}

function CanvasToolbar({ instance }: { instance: ReactFlowInstance<CanvasFlowNode, Edge> | null }) {
  const store = useCanvasStore();
  const tools = [
    { label: '添加提示词', icon: MessageSquarePlus, action: () => store.addNode('prompt') },
    { label: '添加图片', icon: ImagePlus, action: () => store.addNode('image') },
    { label: '添加视频', icon: Video, action: () => store.addNode('video') },
    { label: '分组', icon: FolderPlus, action: store.groupSelected },
    { label: '解组', icon: Ungroup, action: store.ungroupSelected },
    { label: '适配视图', icon: Scan, action: () => instance?.fitView({ padding: .3, duration: 350 }) },
  ];
  return <div className="absolute left-1/2 top-4 z-10 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-border bg-card p-1.5 shadow-panel">
    {tools.map(({ label, icon: Icon, action }) => <Tooltip key={label}><TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={action} aria-label={label}><Icon className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>)}
    <div className="mx-1 h-5 w-px bg-border" />
    <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" disabled={!store.past.length} onClick={store.undo}><Undo2 className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent>撤销</TooltipContent></Tooltip>
    <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" disabled={!store.future.length} onClick={store.redo}><Redo2 className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent>重做</TooltipContent></Tooltip>
    <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" disabled={!store.selectedNodeIds.length} onClick={store.duplicateSelected}><Copy className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent>创建副本</TooltipContent></Tooltip>
    <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" disabled={!store.selectedNodeIds.length && !store.selectedEdgeId} onClick={store.removeSelected}><Trash2 className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent>删除</TooltipContent></Tooltip>
  </div>;
}
