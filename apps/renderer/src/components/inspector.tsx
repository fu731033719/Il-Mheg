import { useEffect, useState } from 'react';
import { AlertCircle, ChevronRight, Clapperboard, GripHorizontal, Image as ImageIcon, ImagePlus, MessageSquareText, Play, RotateCcw, Settings2, Square, Trash2, WandSparkles } from 'lucide-react';
import type { CanvasNode, InputBinding, PublicAsset, PublicModel } from '@ilmheg/contracts';
import { bindingLabel } from '@ilmheg/domain';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useDraggablePanel } from '@/hooks/use-draggable-panel';
import { useCanvasStore } from '@/store/canvas-store';
import { nodePreviewAssetId } from '@/lib/node-preview';
import { cn } from '@/lib/utils';

export function Inspector() {
  const { panelRef, offset, dragHandleProps } = useDraggablePanel<HTMLElement>();
  const graph = useCanvasStore((state) => state.graph);
  const selectedNodeIds = useCanvasStore((state) => state.selectedNodeIds);
  const removeSelected = useCanvasStore((state) => state.removeSelected);
  const node = graph?.nodes.find((item) => item.id === selectedNodeIds[0]);
  if (!node) return null;
  return <aside ref={panelRef} style={{ transform: `translate(${offset.x}px, calc(-50% + ${offset.y}px))` }} className="absolute right-4 top-1/2 z-20 flex h-[90%] w-[340px] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-panel">
    <div className="flex h-12 shrink-0 items-center justify-between border-b border-border/70 px-3.5">
      <div {...dragHandleProps} className="flex h-full min-w-0 flex-1 touch-none select-none items-center gap-2 text-xs font-semibold uppercase tracking-[.14em] text-muted-foreground cursor-grab active:cursor-grabbing"><Settings2 className="h-4 w-4" />属性面板<GripHorizontal className="ml-auto h-4 w-4 opacity-45" /></div>
      <Tooltip>
        <TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/55 dark:hover:text-red-300" onClick={removeSelected} aria-label="删除选中节点"><Trash2 className="h-4 w-4" /></Button></TooltipTrigger>
        <TooltipContent>删除选中节点</TooltipContent>
      </Tooltip>
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto">
      <NodeInspector key={node.id} node={node} />
    </div>
  </aside>;
}

function NodeInspector({ node }: { node: CanvasNode }) {
  const [title, setTitle] = useState(node.title);
  const promptValue = node.kind === 'group' ? '' : node.config.prompt;
  const [prompt, setPrompt] = useState(promptValue);
  const graph = useCanvasStore((state) => state.graph)!;
  const models = useCanvasStore((state) => state.models);
  const assets = useCanvasStore((state) => state.assets);
  const runs = useCanvasStore((state) => state.runs);
  const select = useCanvasStore((state) => state.select);
  const patchNode = useCanvasStore((state) => state.patchNode);
  const importAsset = useCanvasStore((state) => state.importAsset);
  const startRun = useCanvasStore((state) => state.startRun);
  const cancelRun = useCanvasStore((state) => state.cancelRun);
  const retryRun = useCanvasStore((state) => state.retryRun);
  const incoming = graph.edges.filter((edge) => edge.target === node.id).flatMap((edge) => {
    const source = graph.nodes.find((item) => item.id === edge.source);
    if (!source) return [];
    const assetId = nodePreviewAssetId(source);
    return [{ edge, source, asset: assetId ? assets[assetId] : undefined }];
  });
  const run = runs.find((item) => item.nodeId === node.id);
  const availableModels = models.filter((model) => node.kind !== 'group' && model.compatibleNodeKinds.includes(node.kind));
  const selectedModel = node.kind === 'group' ? undefined : availableModels.find((model) => model.id === node.config.model?.modelId);
  const selectedEndpoint = node.kind === 'group' ? undefined : selectedModel?.endpoints.find((endpoint) => endpoint.id === node.config.model?.endpointId) ?? selectedModel?.endpoints[0];
  const active = run && ['QUEUED', 'PREPARING', 'SUBMITTING', 'WAITING_REMOTE', 'DOWNLOADING', 'CANCEL_REQUESTED'].includes(run.status);

  useEffect(() => { setTitle(node.title); setPrompt(promptValue); }, [node.id, node.title, promptValue]);

  const saveText = () => patchNode(node.id, (current) => {
    const stamp = new Date().toISOString();
    if (current.kind === 'group') return { ...current, title: title.trim() || current.title, updatedAt: stamp };
    return { ...current, title: title.trim() || current.title, config: { ...current.config, prompt }, updatedAt: stamp } as CanvasNode;
  });

  const changeModel = (modelId: string) => {
    const model = models.find((item) => item.id === modelId)!;
    patchNode(node.id, (current) => current.kind !== 'group' ? {
      ...current,
      config: { ...current.config, model: { modelId, params: defaultsFor(model.endpoints[0]) } },
      updatedAt: new Date().toISOString(),
    } as CanvasNode : current);
  };

  const changeEndpoint = (endpointId: string) => patchNode(node.id, (current) => {
    if (current.kind === 'group') return current;
    const endpoint = selectedModel?.endpoints.find((item) => item.id === endpointId);
    return { ...current, config: { ...current.config, model: { ...current.config.model!, endpointId, params: { ...defaultsFor(endpoint), ...current.config.model?.params } } }, updatedAt: new Date().toISOString() } as CanvasNode;
  });

  const changeParam = (key: string, value: unknown) => patchNode(node.id, (current) => {
    if (current.kind === 'group') return current;
    return { ...current, config: { ...current.config, model: { ...current.config.model!, params: { ...current.config.model?.params, [key]: value } } }, updatedAt: new Date().toISOString() } as CanvasNode;
  });

  return <div className="space-y-5 p-4">
    <section className="space-y-2">
      <Label>节点名称</Label>
      <Input value={title} onChange={(event) => setTitle(event.target.value)} onBlur={saveText} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} />
    </section>
    {node.kind !== 'group' ? <section className="space-y-2">
      <div className="flex items-center justify-between"><Label>{node.kind === 'video' ? '运动描述' : '提示词'}</Label><span className="text-[10px] text-muted-foreground">{prompt.length} 字</span></div>
      <Textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} onBlur={saveText} placeholder={node.kind === 'video' ? '描述镜头、动作与氛围…' : '描述主体、构图、光线与风格…'} className="min-h-[118px]" />
    </section> : null}
    {node.kind !== 'group' ? <>
      <Separator />
      <section className="space-y-3">
        <Label>模型</Label>
        <Select value={selectedModel?.id} onValueChange={changeModel}><SelectTrigger><SelectValue placeholder="选择模型" /></SelectTrigger><SelectContent>{availableModels.map((model) => <SelectItem key={model.id} value={model.id}>{model.displayName}</SelectItem>)}</SelectContent></Select>
        {node.config.model?.modelId && !selectedModel ? <p className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-800 dark:border-amber-900 dark:bg-amber-950/55 dark:text-amber-200"><AlertCircle className="h-3.5 w-3.5 shrink-0" />原模型配置已删除或与当前节点不再兼容，请重新选择。</p> : null}
        {!availableModels.length ? <p className="text-[11px] leading-5 text-muted-foreground">暂无与该节点兼容的已配置模型，请先在应用设置中添加。</p> : null}
        {selectedModel ? <div className="flex items-start gap-2.5 rounded-lg border border-border/70 bg-muted/30 p-2.5">
          {selectedModel.providerLogoPath ? <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-background p-1.5"><img src={selectedModel.providerLogoPath} alt="" className="h-full w-full object-contain dark:invert" /></div> : null}
          <div className="min-w-0"><div className="text-[10px] font-semibold uppercase tracking-[.12em] text-muted-foreground">{selectedModel.providerName ?? selectedModel.providerId}</div><p className="mt-1 text-[11px] leading-5 text-muted-foreground">{selectedModel.description}</p></div>
        </div> : null}
        {selectedModel && selectedModel.endpoints.length > 1 ? <><Label>生成模式</Label><Select value={selectedEndpoint?.id} onValueChange={changeEndpoint}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{selectedModel.endpoints.map((endpoint) => <SelectItem key={endpoint.id} value={endpoint.id}>{endpoint.displayName}</SelectItem>)}</SelectContent></Select></> : null}
      </section>
      {selectedEndpoint?.params.length ? <section className="grid grid-cols-2 gap-3">{selectedEndpoint.params.map((field) => <ParamControl key={field.key} field={field} value={node.config.model?.params[field.key] ?? field.defaultValue} onChange={(value) => changeParam(field.key, value)} />)}</section> : null}
    </> : null}
    {node.kind === 'image' || node.kind === 'video' ? <>
      <Separator />
      <section className="space-y-2.5">
        <div className="flex items-center justify-between"><Label>输入素材</Label><Badge>{incoming.length}</Badge></div>
        {node.kind === 'image' ? <Button variant="outline" className="w-full justify-start" onClick={() => void importAsset(node.id)}><ImagePlus className="mr-2 h-4 w-4" />{node.config.sourceAssetId ? '替换本地图片' : '导入本地图片'}</Button> : null}
        {incoming.length ? <div className="space-y-1.5">{incoming.map(({ edge, source, asset }) => <NodeReference
          key={edge.id}
          node={source}
          binding={edge.binding}
          asset={asset}
          onSelect={() => select([source.id])}
        />)}</div> : <p className="rounded-lg border border-dashed border-border p-3 text-center text-[11px] leading-5 text-muted-foreground">靠近节点卡片边缘并点击“+”创建连接节点，或按住拖向另一张卡片。</p>}
      </section>
      <RunPanel node={node} run={run} active={Boolean(active)} onStart={() => void startRun(node.id)} onCancel={() => run && void cancelRun(run.id)} onRetry={() => run && void retryRun(run.id)} />
    </> : node.kind === 'prompt' ? <div className="rounded-xl border border-border bg-muted/30 p-3 text-xs leading-5 text-muted-foreground">提示词节点保存所选大语言/多模态模型的精确关联；自动扩写执行将在后续节点能力中接入。</div>
      : <div className="rounded-xl border border-border bg-muted/30 p-3 text-xs leading-5 text-muted-foreground">分组只负责整理画布，不参与模型执行。选择两个或更多节点后可从顶部工具栏创建分组。</div>}
  </div>;
}

function NodeReference({ node, binding, asset, onSelect }: {
  node: CanvasNode;
  binding: InputBinding;
  asset?: PublicAsset;
  onSelect(): void;
}) {
  return <button
    type="button"
    className="group flex w-full items-center gap-2.5 rounded-lg border border-border bg-muted/30 p-1.5 text-left transition-colors hover:border-foreground/20 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
    onClick={onSelect}
    aria-label={`选择引用节点“${node.title}”`}
    title={`切换到“${node.title}”`}
  >
    <NodeReferenceThumbnail node={node} asset={asset} />
    <span className="min-w-0 flex-1">
      <span className="block text-[10px] leading-4 text-muted-foreground">{bindingLabel(binding)}</span>
      <span className="block truncate text-xs font-medium text-foreground">{node.title}</span>
    </span>
    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" aria-hidden="true" />
  </button>;
}

function NodeReferenceThumbnail({ node, asset }: { node: CanvasNode; asset?: PublicAsset }) {
  const mediaClassName = 'h-full w-full object-cover';
  const frameClassName = 'flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-background text-muted-foreground';
  if (asset?.mimeType.startsWith('image/')) return <span className={frameClassName}><img src={asset.url} alt="" className={mediaClassName} /></span>;
  if (asset?.mimeType.startsWith('video/')) return <span className={frameClassName}><video src={asset.url} muted playsInline preload="metadata" className={mediaClassName} aria-hidden="true" /></span>;
  const Icon = node.kind === 'prompt' ? MessageSquareText : node.kind === 'video' ? Clapperboard : ImageIcon;
  return <span className={frameClassName}>
    <Icon className="h-5 w-5" aria-hidden="true" />
  </span>;
}

function ParamControl({ field, value, onChange }: { field: PublicModel['endpoints'][number]['params'][number]; value: unknown; onChange: (value: unknown) => void }) {
  const controlValue = field.type === 'select' && field.options && !field.options.some((option) => option.value === value)
    ? field.defaultValue
    : value;
  return <div className={cn('space-y-1.5', field.type === 'boolean' && 'col-span-2')}><Label>{field.label}</Label>
    {field.type === 'select' ? <Select value={String(controlValue)} onValueChange={onChange}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{field.options?.map((option) => <SelectItem key={String(option.value)} value={String(option.value)}>{option.label}</SelectItem>)}</SelectContent></Select> : null}
    {field.type === 'number' ? <Input type="number" min={field.min} max={field.max} step={field.step} value={Number(value ?? 0)} onChange={(event) => onChange(Number(event.target.value))} /> : null}
    {field.type === 'text' ? <Input value={String(value ?? '')} onChange={(event) => onChange(event.target.value)} /> : null}
    {field.type === 'boolean' ? <button className={cn('flex w-full items-center justify-between rounded-lg border px-3 py-2 text-xs', value ? 'border-primary/30 bg-primary/8' : 'border-border bg-background/35')} onClick={() => onChange(!value)}><span>{value ? '已开启' : '已关闭'}</span><span className={cn('h-4 w-7 rounded-full p-0.5 transition', value ? 'bg-primary' : 'bg-muted')}><span className={cn('block h-3 w-3 rounded-full bg-background transition', Boolean(value) && 'translate-x-3')} /></span></button> : null}
  </div>;
}

function RunPanel({ node, run, active, onStart, onCancel, onRetry }: { node: CanvasNode; run: ReturnType<typeof useCanvasStore.getState>['runs'][number] | undefined; active: boolean; onStart: () => void; onCancel: () => void; onRetry: () => void }) {
  return <section className="space-y-2.5 rounded-xl border border-border bg-muted/45 p-3">
    {run?.error ? <div className="flex gap-2 rounded-lg border border-red-100 bg-red-50 p-2.5 text-[11px] leading-5 text-red-700 dark:border-red-950 dark:bg-red-950/55 dark:text-red-300"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{run.error.message}</div> : null}
    {active ? <Button variant="outline" className="w-full" onClick={onCancel}><Square className="mr-2 h-3.5 w-3.5 fill-current" />停止任务</Button>
      : run?.status === 'FAILED' || run?.status === 'INTERRUPTED' ? <Button className="w-full" onClick={onRetry}><RotateCcw className="mr-2 h-4 w-4" />重试生成</Button>
      : <Button className="w-full" onClick={onStart}><Play className="mr-2 h-4 w-4 fill-current" />{node.output && 'assetIds' in node.output && node.output.assetIds.length ? '生成新版本' : '开始生成'}</Button>}
    <div className="flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground"><WandSparkles className="h-3 w-3" />结果会自动保存为本地素材</div>
  </section>;
}

function Label({ children }: { children: React.ReactNode }) { return <div className="text-[11px] font-semibold uppercase tracking-[.12em] text-muted-foreground">{children}</div>; }
function defaultsFor(endpoint: PublicModel['endpoints'][number] | undefined) { return Object.fromEntries(endpoint?.params.map((field) => [field.key, field.defaultValue]) ?? []); }
