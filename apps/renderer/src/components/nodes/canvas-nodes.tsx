import { memo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { Handle, NodeResizer, Position, type Node, type NodeProps } from '@xyflow/react';
import { CheckCircle2, CircleAlert, CircleStop, Clapperboard, Expand, FolderOpen, Image as ImageIcon, LoaderCircle, MessageSquareText, Plus } from 'lucide-react';
import type { CanvasNode, PublicAsset, PublicRunRecord } from '@ilmheg/contracts';
import type { MediaViewerTarget } from '@/components/media-viewer-dialog';
import {
  CONNECTION_TARGET_HANDLES,
  connectionOptions,
  type ConnectionGesture,
  type ConnectionPointerStart,
  type ConnectionSide,
} from '@/lib/node-connections';
import {
  CONNECTION_HOVER_ZONE_OUTSET,
  CONNECTION_HOVER_ZONE_SIZE,
  connectionPointY,
} from '@/lib/node-connection-hover';
import { cn } from '@/lib/utils';

export type CanvasFlowData = {
  canvasNode: CanvasNode;
  asset?: PublicAsset;
  run?: PublicRunRecord;
  connectionGesture: ConnectionGesture | null;
  selectNode(nodeId: string, additive: boolean): void;
  beginConnection(input: ConnectionPointerStart): void;
  viewMedia(target: MediaViewerTarget): void;
};
export type CanvasFlowNode = Node<CanvasFlowData, CanvasNode['kind']>;

const statusLabels: Record<string, string> = {
  QUEUED: '排队中', PREPARING: '准备输入', SUBMITTING: '正在提交', WAITING_REMOTE: '模型生成中',
  DOWNLOADING: '保存结果', SUCCEEDED: '已完成', FAILED: '生成失败', CANCEL_REQUESTED: '正在取消',
  CANCELLED: '已取消', CANCELLED_LOCAL_ONLY: '已停止跟踪', INTERRUPTED: '已中断',
};

function NodeFrame({ selected, node, run, connectionGesture, selectNode, beginConnection, children, className }: {
  selected: boolean;
  node: CanvasNode;
  run?: PublicRunRecord;
  connectionGesture: ConnectionGesture | null;
  selectNode(nodeId: string, additive: boolean): void;
  beginConnection(input: ConnectionPointerStart): void;
  children?: ReactNode;
  className?: string;
}) {
  const active = run && !['SUCCEEDED', 'FAILED', 'CANCELLED', 'CANCELLED_LOCAL_ONLY', 'INTERRUPTED'].includes(run.status);
  const cardRef = useRef<HTMLDivElement>(null);
  const [hoverPoint, setHoverPoint] = useState<{ side: ConnectionSide; y: number } | null>(null);
  const gesturePoint = connectionGesture?.originNodeId === node.id
    ? { side: connectionGesture.side, y: connectionGesture.anchorY }
    : null;
  const activePoint = gesturePoint ?? hoverPoint;

  const trackEdge = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (connectionGesture?.started) return;
    const bounds = cardRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const candidates = (['left', 'right'] as const)
      .filter((side) => connectionOptions(node.kind, side).length)
      .map((side) => ({ side, distance: side === 'left' ? event.clientX - bounds.left : bounds.right - event.clientX }))
      .sort((left, right) => left.distance - right.distance);
    const closest = candidates[0];
    if (!closest || closest.distance > 54) {
      setHoverPoint(null);
      return;
    }
    const y = connectionPointY(event.clientY, bounds.top, bounds.height, cardRef.current?.offsetHeight ?? bounds.height);
    setHoverPoint((current) => current?.side === closest.side && current.y === y ? current : { side: closest.side, y });
  };

  return <div
    className="group/node relative w-full text-card-foreground"
    data-canvas-node-id={node.id}
    data-canvas-node-kind={node.kind}
    onClick={(event) => { event.stopPropagation(); selectNode(node.id, event.shiftKey); }}
  >
    <div className="mb-2 flex h-7 items-center justify-between px-1">
      <div className="flex min-w-0 items-center gap-2">
        <NodeIcon kind={node.kind} />
        <span className="truncate text-[12px] font-semibold tracking-wide">{node.title}</span>
      </div>
      {run ? <RunStatus status={run.status} /> : null}
    </div>
    <div
      ref={cardRef}
      className="relative"
      onPointerMove={trackEdge}
      onPointerLeave={() => { if (connectionGesture?.originNodeId !== node.id) setHoverPoint(null); }}
    >
      <div className={cn(
        'relative flex w-full items-center justify-center overflow-hidden rounded-xl border bg-card shadow-[0_8px_24px_rgba(24,24,27,.08)] transition-all',
        selected ? 'border-orange-400 shadow-[0_0_0_3px_rgba(251,146,60,.18),0_12px_28px_rgba(249,115,22,.14)]' : 'border-border group-hover/node:border-zinc-300 dark:group-hover/node:border-zinc-600',
        connectionGesture?.hoveredNodeId === node.id && 'border-orange-400 shadow-[0_0_0_4px_rgba(251,146,60,.16),0_12px_28px_rgba(249,115,22,.14)]',
        active && 'status-shimmer', className,
      )}>{children}</div>
      {(['left', 'right'] as const)
        .filter((side) => connectionOptions(node.kind, side).length)
        .map((side) => <div
          key={side}
          data-connection-hover-zone={side}
          className="nodrag nopan absolute z-[8] -translate-y-1/2 rounded-full"
          style={{
            top: '50%',
            width: CONNECTION_HOVER_ZONE_SIZE,
            height: CONNECTION_HOVER_ZONE_SIZE,
            ...(side === 'left' ? { left: -CONNECTION_HOVER_ZONE_OUTSET } : { right: -CONNECTION_HOVER_ZONE_OUTSET }),
          }}
          onPointerEnter={trackEdge}
          aria-hidden="true"
        />)}
      <Handle type="target" position={Position.Left} id={CONNECTION_TARGET_HANDLES.default} isConnectable={false} className="canvas-connection-handle" style={{ left: -28 }} />
      {node.kind === 'video' ? <>
        <Handle type="target" position={Position.Left} id={CONNECTION_TARGET_HANDLES.firstFrame} isConnectable={false} className="canvas-connection-handle" style={{ left: -28 }} />
        <Handle type="target" position={Position.Right} id={CONNECTION_TARGET_HANDLES.lastFrame} isConnectable={false} className="canvas-connection-handle" style={{ right: -28 }} />
      </> : null}
      <Handle type="source" position={Position.Right} id="output" isConnectable={false} className="canvas-connection-handle" style={{ right: -28 }} />
      {activePoint ? <ConnectionPoint
        side={activePoint.side}
        y={activePoint.y}
        node={node}
        gesture={connectionGesture}
        onBegin={beginConnection}
      /> : null}
    </div>
  </div>;
}

function ConnectionPoint({ side, y, node, gesture, onBegin }: {
  side: ConnectionSide;
  y: number;
  node: CanvasNode;
  gesture: ConnectionGesture | null;
  onBegin(input: ConnectionPointerStart): void;
}) {
  const pending = gesture?.originNodeId === node.id && gesture.side === side;
  const label = side === 'right' ? `从“${node.title}”开始连线` : `连接到“${node.title}”`;
  return <div
    className={cn(
      'nodrag nopan absolute z-10 flex h-10 w-10 -translate-y-1/2 items-center',
      side === 'left' ? '-left-10 justify-start' : '-right-10 justify-end',
    )}
    style={{ top: y }}
  >
    <button
      type="button"
      className={cn(
        'flex h-6 w-6 items-center justify-center rounded-full border bg-card text-zinc-500 shadow-sm transition-[border-color,background-color,color,box-shadow] duration-150 dark:text-zinc-400',
        pending ? 'border-orange-400 bg-orange-50 text-orange-600 ring-2 ring-orange-100 dark:bg-orange-950/55 dark:text-orange-300 dark:ring-orange-950' : 'border-zinc-300 hover:border-orange-400 hover:text-orange-600 dark:border-zinc-600 dark:hover:border-orange-400 dark:hover:text-orange-300',
      )}
      aria-label={label}
      title={label}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        onBegin({
          pointerId: event.pointerId,
          nodeId: node.id,
          nodeKind: node.kind,
          side,
          anchorY: y,
          clientX: event.clientX,
          clientY: event.clientY,
        });
      }}
      onClick={(event) => { event.preventDefault(); event.stopPropagation(); }}
    ><Plus className="h-3.5 w-3.5" /></button>
  </div>;
}

function RunStatus({ status }: { status: PublicRunRecord['status'] }) {
  const label = statusLabels[status];
  if (status === 'SUCCEEDED') return <CheckCircle2 className="ml-2 h-4 w-4 shrink-0 text-emerald-500" aria-label={label} />;
  if (status === 'FAILED') return <CircleAlert className="ml-2 h-4 w-4 shrink-0 text-red-500" aria-label={label} />;
  if (['CANCELLED', 'CANCELLED_LOCAL_ONLY', 'INTERRUPTED'].includes(status)) return <CircleStop className="ml-2 h-4 w-4 shrink-0 text-zinc-400" aria-label={label} />;
  return <LoaderCircle className="ml-2 h-4 w-4 shrink-0 animate-spin text-zinc-500" aria-label={label} />;
}

function NodeIcon({ kind }: { kind: CanvasNode['kind'] }) {
  const cls = 'h-4 w-4 shrink-0';
  if (kind === 'prompt') return <MessageSquareText className={cn(cls, 'text-zinc-700 dark:text-zinc-300')} />;
  if (kind === 'image') return <ImageIcon className={cn(cls, 'text-neutral-700 dark:text-neutral-300')} />;
  if (kind === 'video') return <Clapperboard className={cn(cls, 'text-stone-700 dark:text-stone-300')} />;
  return <FolderOpen className={cn(cls, 'text-zinc-500 dark:text-zinc-400')} />;
}

function PromptCanvasNode({ data, selected }: NodeProps<CanvasFlowNode>) {
  const node = data.canvasNode;
  if (node.kind !== 'prompt') return null;
  return <NodeFrame selected={selected} node={node} run={data.run} connectionGesture={data.connectionGesture} selectNode={data.selectNode} beginConnection={data.beginConnection} className="h-[72px]">
    <MessageSquareText className="h-8 w-8 text-zinc-300 dark:text-zinc-600" aria-hidden="true" />
  </NodeFrame>;
}

function ImageCanvasNode({ data, selected }: NodeProps<CanvasFlowNode>) {
  const node = data.canvasNode;
  if (node.kind !== 'image') return null;
  return <NodeFrame selected={selected} node={node} run={data.run} connectionGesture={data.connectionGesture} selectNode={data.selectNode} beginConnection={data.beginConnection} className="aspect-square bg-zinc-50 dark:bg-zinc-900">
    {data.asset ? <img src={data.asset.url} alt={node.title} className="h-full w-full object-cover" /> : <ImageIcon className="h-9 w-9 text-zinc-300 dark:text-zinc-600" aria-hidden="true" />}
    {data.asset ? <MediaViewerButton title={node.title} asset={data.asset} onView={data.viewMedia} /> : null}
  </NodeFrame>;
}

function VideoCanvasNode({ data, selected }: NodeProps<CanvasFlowNode>) {
  const node = data.canvasNode;
  if (node.kind !== 'video') return null;
  const isVideo = data.asset?.mimeType.startsWith('video/');
  return <NodeFrame selected={selected} node={node} run={data.run} connectionGesture={data.connectionGesture} selectNode={data.selectNode} beginConnection={data.beginConnection} className="aspect-video bg-zinc-50 dark:bg-zinc-900">
    {data.asset && isVideo ? <video src={data.asset.url} muted loop controls className="h-full w-full object-cover" /> : null}
    {data.asset && !isVideo ? <img src={data.asset.url} alt={node.title} className="h-full w-full object-cover" /> : null}
    {!data.asset ? <Clapperboard className="h-9 w-9 text-zinc-300 dark:text-zinc-600" aria-hidden="true" /> : null}
    {data.asset ? <MediaViewerButton title={node.title} asset={data.asset} onView={data.viewMedia} /> : null}
  </NodeFrame>;
}

function MediaViewerButton({ title, asset, onView }: {
  title: string;
  asset: PublicAsset;
  onView(target: MediaViewerTarget): void;
}) {
  return <button
    type="button"
    className="nodrag nopan absolute right-2 top-2 z-[6] flex h-8 w-8 items-center justify-center rounded-full border border-white/30 bg-black/45 text-white opacity-0 shadow-md backdrop-blur-md transition hover:bg-black/65 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 group-hover/node:opacity-100"
    aria-label={`全屏查看${title}`}
    title="全屏查看"
    onPointerDown={(event) => event.stopPropagation()}
    onClick={(event) => {
      event.preventDefault();
      event.stopPropagation();
      onView({ title, asset });
    }}
  ><Expand className="h-4 w-4" /></button>;
}

function GroupCanvasNode({ data, selected }: NodeProps<CanvasFlowNode>) {
  const node = data.canvasNode;
  if (node.kind !== 'group') return null;
  return <div className={cn('h-full w-full rounded-2xl border border-dashed bg-zinc-50/70 transition-all dark:bg-zinc-900/70', selected ? 'border-orange-400 shadow-[0_0_0_3px_rgba(251,146,60,.16),0_12px_28px_rgba(249,115,22,.10)]' : 'border-zinc-300 dark:border-zinc-700')} onClick={(event) => { event.stopPropagation(); data.selectNode(node.id, event.shiftKey); }}>
    <NodeResizer minWidth={360} minHeight={260} isVisible={selected} lineClassName="!border-orange-400/80" handleClassName="!h-2.5 !w-2.5 !border-card !bg-sky-300 !shadow-[0_1px_4px_rgba(59,130,246,.22)]" />
    <div className="flex h-11 items-center gap-2 px-4 text-xs font-semibold text-zinc-600 dark:text-zinc-400"><FolderOpen className="h-4 w-4" />{node.title}</div>
  </div>;
}

export const nodeTypes = {
  prompt: memo(PromptCanvasNode),
  image: memo(ImageCanvasNode),
  video: memo(VideoCanvasNode),
  group: memo(GroupCanvasNode),
};
