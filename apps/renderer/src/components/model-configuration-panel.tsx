import { useState, type FormEvent } from 'react';
import { Bot, Check, KeyRound, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { CustomVideoMode, ModelConfiguration, ModelType, SaveModelConfigurationInput, VisualKind } from '@ilmheg/contracts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { canvasApi } from '@/lib/platform';
import { useCanvasStore } from '@/store/canvas-store';

const MODEL_TYPES: Array<{ value: ModelType; label: string; nodes: string }> = [
  { value: 'language', label: '大语言模型', nodes: '提示词节点' },
  { value: 'vision', label: '视觉模型', nodes: '图片或视频节点（按生成用途）' },
  { value: 'multimodal', label: '多模态模型', nodes: '提示词、图片节点' },
  { value: 'speech', label: '语音模型', nodes: '暂无对应节点' },
];

type Draft = Pick<SaveModelConfigurationInput, 'displayName' | 'modelName' | 'endpoint' | 'modelType' | 'provider'> & {
  id?: string;
  apiKey: string;
  visualKind: VisualKind;
  videoMode: CustomVideoMode;
};

const VISUAL_KINDS: Array<{ value: VisualKind; label: string }> = [
  { value: 'image', label: '图片生成' },
  { value: 'video', label: '视频生成' },
];

const VIDEO_MODES: Array<{ value: CustomVideoMode; label: string }> = [
  { value: 'universal', label: '通用（文本 / 首尾帧 / 参考）' },
  { value: 'text', label: '文生视频' },
  { value: 'first_last', label: '首帧 / 首尾帧' },
  { value: 'reference', label: '参考生视频' },
];

const emptyDraft = (): Draft => ({
  displayName: '',
  modelName: '',
  endpoint: '',
  modelType: 'vision',
  visualKind: 'image',
  videoMode: 'universal',
  provider: '',
  apiKey: '',
});

export function ModelConfigurationPanel() {
  const configurations = useCanvasStore((state) => state.modelConfigurations);
  const refreshModelCatalog = useCanvasStore((state) => state.refreshModelCatalog);
  const [editing, setEditing] = useState<Draft>();
  const [busy, setBusy] = useState<string>();
  const [messages, setMessages] = useState<Record<string, string>>({});

  const startEditing = (configuration: ModelConfiguration) => setEditing({
    id: configuration.id,
    displayName: configuration.displayName,
    modelName: configuration.modelName,
    endpoint: configuration.endpoint,
    modelType: configuration.modelType,
    visualKind: configuration.visualKind,
    videoMode: configuration.videoMode,
    provider: configuration.provider,
    apiKey: '',
  });

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    setBusy(editing.id ?? 'new');
    try {
      await canvasApi.modelConfigurations.save({
        ...editing,
        apiKey: editing.apiKey.trim() || undefined,
      });
      await refreshModelCatalog();
      setEditing(undefined);
    } catch (error) {
      setMessages((current) => ({ ...current, form: error instanceof Error ? error.message : String(error) }));
    } finally {
      setBusy(undefined);
    }
  };

  const remove = async (configuration: ModelConfiguration) => {
    if (!window.confirm(`删除模型配置“${configuration.displayName}”？已引用它的节点将提示重新选择。`)) return;
    setBusy(configuration.id);
    try {
      await canvasApi.modelConfigurations.remove(configuration.id);
      if (editing?.id === configuration.id) setEditing(undefined);
      await refreshModelCatalog();
    } finally {
      setBusy(undefined);
    }
  };

  const test = async (configuration: ModelConfiguration) => {
    setBusy(configuration.id);
    try {
      const result = await canvasApi.modelConfigurations.test(configuration.id);
      setMessages((current) => ({ ...current, [configuration.id]: result.message }));
    } catch (error) {
      setMessages((current) => ({ ...current, [configuration.id]: error instanceof Error ? error.message : String(error) }));
    } finally {
      setBusy(undefined);
    }
  };

  return <div className="space-y-4">
    <div className="flex items-start justify-between gap-4">
      <div>
        <h3 className="text-sm font-semibold">自定义模型</h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">配置会生成稳定 ID，节点会精确引用该 ID。API Key 只保存在本机加密凭据库。
        </p>
      </div>
      <Button size="sm" onClick={() => setEditing(emptyDraft())} disabled={Boolean(editing)}><Plus className="mr-1.5 h-3.5 w-3.5" />添加模型</Button>
    </div>

    {editing ? <ModelEditor draft={editing} busy={busy === (editing.id ?? 'new')} message={messages.form} onChange={setEditing} onCancel={() => setEditing(undefined)} onSubmit={save} /> : null}

    <div className="space-y-2.5">
      {configurations.map((configuration) => {
        const type = MODEL_TYPES.find((item) => item.value === configuration.modelType)!;
        return <article key={configuration.id} className="rounded-xl border border-border bg-muted/20 p-3.5">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background"><Bot className="h-4 w-4" /></div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="truncate text-sm font-semibold">{configuration.displayName}</h4>
                <Badge>{type.label}</Badge>
                {configuration.credentialConfigured ? <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/55 dark:text-emerald-300"><Check className="mr-1 h-3 w-3" />已保存密钥</Badge> : <Badge>无密钥</Badge>}
              </div>
              <p className="mt-1 truncate text-[11px] text-muted-foreground">{configuration.provider} · {configuration.modelName}</p>
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{configuration.endpoint}</p>
              <p className="mt-1 text-[10px] text-muted-foreground">可用于：{nodesForConfiguration(configuration)}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button variant="outline" size="sm" onClick={() => void test(configuration)} disabled={busy === configuration.id}>{busy === configuration.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : '测试'}</Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => startEditing(configuration)} disabled={Boolean(editing)} aria-label={`编辑 ${configuration.displayName}`}><Pencil className="h-3.5 w-3.5" /></Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/55" onClick={() => void remove(configuration)} disabled={busy === configuration.id} aria-label={`删除 ${configuration.displayName}`}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          </div>
          {messages[configuration.id] ? <p className="mt-2 text-[11px] text-muted-foreground">{messages[configuration.id]}</p> : null}
        </article>;
      })}
      {!configurations.length && !editing ? <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center"><Bot className="mx-auto h-6 w-6 text-muted-foreground" /><p className="mt-2 text-xs font-medium">还没有自定义模型</p><p className="mt-1 text-[11px] text-muted-foreground">添加后会按模型类型出现在对应节点中。</p></div> : null}
    </div>
  </div>;
}

function ModelEditor({ draft, busy, message, onChange, onCancel, onSubmit }: {
  draft: Draft;
  busy: boolean;
  message?: string;
  onChange(draft: Draft): void;
  onCancel(): void;
  onSubmit(event: FormEvent): void;
}) {
  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => onChange({ ...draft, [key]: value });
  const type = MODEL_TYPES.find((item) => item.value === draft.modelType)!;
  return <form onSubmit={onSubmit} className="space-y-3 rounded-xl border border-foreground/20 bg-muted/25 p-4">
    <div className="flex items-center justify-between"><div className="text-xs font-semibold">{draft.id ? '编辑模型' : '新增模型'}</div><Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={onCancel} aria-label="取消编辑"><X className="h-3.5 w-3.5" /></Button></div>
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="显示名称"><Input required value={draft.displayName} onChange={(event) => update('displayName', event.target.value)} placeholder="例：创意绘图 Pro" /></Field>
      <Field label="LLM 厂商"><Input required value={draft.provider} onChange={(event) => update('provider', event.target.value)} placeholder="例：OpenAI / 本地 Ollama" /></Field>
      <Field label="上游模型名称"><Input required value={draft.modelName} onChange={(event) => update('modelName', event.target.value)} placeholder="例：gpt-image-2" /></Field>
      <Field label="模型类型"><Select value={draft.modelType} onValueChange={(value) => update('modelType', value as ModelType)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{MODEL_TYPES.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></Field>
      {draft.modelType === 'vision' ? <Field label="生成用途"><Select value={draft.visualKind} onValueChange={(value) => update('visualKind', value as VisualKind)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{VISUAL_KINDS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></Field> : null}
      {draft.modelType === 'vision' && draft.visualKind === 'video' ? <Field label="视频输入模式"><Select value={draft.videoMode} onValueChange={(value) => update('videoMode', value as CustomVideoMode)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{VIDEO_MODES.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></Field> : null}
      <Field label="Endpoint / Base URL" className="sm:col-span-2"><Input required type="url" value={draft.endpoint} onChange={(event) => update('endpoint', event.target.value)} placeholder={draft.modelType === 'vision' && draft.visualKind === 'video' ? '.../compatible-mode/v1 或 .../video-synthesis' : 'https://api.example.com/v1 或 .../images/generations'} /></Field>
      <Field label={draft.id ? 'API Key（留空则保持原值）' : 'API Key（可选）'} className="sm:col-span-2"><div className="relative"><KeyRound className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" /><Input type="password" autoComplete="off" value={draft.apiKey} onChange={(event) => update('apiKey', event.target.value)} className="pl-9" placeholder="sk-..." /></div></Field>
    </div>
    <div className="flex items-center justify-between gap-3">
      <p className="text-[10px] text-muted-foreground">保存后可用于：{draft.modelType === 'vision' ? draft.visualKind === 'video' ? '视频节点（DashScope 异步协议）' : '图片节点' : type.nodes}</p>
      <div className="flex gap-2"><Button type="button" variant="outline" size="sm" onClick={onCancel}>取消</Button><Button type="submit" size="sm" disabled={busy}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : '保存模型'}</Button></div>
    </div>
    {message ? <p className="text-[11px] text-red-600 dark:text-red-400">{message}</p> : null}
  </form>;
}

function nodesForConfiguration(configuration: ModelConfiguration) {
  if (configuration.modelType === 'vision') return configuration.visualKind === 'video' ? '视频节点' : '图片节点';
  return MODEL_TYPES.find((item) => item.value === configuration.modelType)?.nodes ?? '暂无对应节点';
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return <label className={className}><span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[.1em] text-muted-foreground">{label}</span>{children}</label>;
}
