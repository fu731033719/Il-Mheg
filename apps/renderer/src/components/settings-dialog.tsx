import { useState } from 'react';
import {
  Check,
  CloudOff,
  Database,
  Keyboard,
  KeyRound,
  Loader2,
  Moon,
  Palette,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useTheme } from '@/components/theme-provider';
import { ModelConfigurationPanel } from '@/components/model-configuration-panel';
import { APP_SHORTCUT_GROUPS } from '@/lib/keyboard-shortcuts';
import type { AppTheme } from '@/lib/theme';
import { canvasApi } from '@/lib/platform';
import { useCanvasStore } from '@/store/canvas-store';

export function SettingsDialog({ collapsed = false }: { collapsed?: boolean }) {
  const providers = useCanvasStore((state) => state.providers);
  const refreshProviders = useCanvasStore((state) => state.refreshProviders);
  const { theme, setTheme } = useTheme();
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string>();
  const [result, setResult] = useState<Record<string, string>>({});

  const save = async (providerId: string) => {
    if (!secrets[providerId]?.trim()) return;
    setBusy(providerId);
    try {
      await canvasApi.providers.putCredential({ providerId, secret: secrets[providerId] });
      setSecrets((current) => ({ ...current, [providerId]: '' }));
      setResult((current) => ({ ...current, [providerId]: '凭据已加密保存' }));
      await refreshProviders();
    } catch (error) {
      setResult((current) => ({ ...current, [providerId]: error instanceof Error ? error.message : String(error) }));
    } finally {
      setBusy(undefined);
    }
  };

  const test = async (providerId: string) => {
    setBusy(providerId);
    try {
      const response = await canvasApi.providers.test(providerId);
      setResult((current) => ({ ...current, [providerId]: response.message }));
      await refreshProviders();
    } catch (error) {
      setResult((current) => ({ ...current, [providerId]: error instanceof Error ? error.message : String(error) }));
    } finally {
      setBusy(undefined);
    }
  };

  const remove = async (providerId: string) => {
    setBusy(providerId);
    try {
      await canvasApi.providers.deleteCredential(providerId);
      await refreshProviders();
      setResult((current) => ({ ...current, [providerId]: '凭据已删除' }));
    } finally {
      setBusy(undefined);
    }
  };

  return <Dialog onOpenChange={(open) => { if (open) void refreshProviders(); }}>
    <Tooltip>
      <TooltipTrigger asChild>
        <DialogTrigger asChild>
          <Button variant="ghost" className={collapsed ? 'h-10 w-10 p-0 text-muted-foreground hover:text-foreground' : 'h-11 w-full justify-start gap-3 px-3 text-muted-foreground hover:text-foreground'} aria-label="应用设置">
            <Settings className="h-4 w-4" />
            <span className={collapsed ? 'sr-only' : undefined}>应用设置</span>
          </Button>
        </DialogTrigger>
      </TooltipTrigger>
      <TooltipContent side="right">应用设置</TooltipContent>
    </Tooltip>
    <DialogContent className="w-[min(94vw,900px)]">
      <DialogHeader><DialogTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" />应用设置</DialogTitle><DialogDescription>管理界面外观、模型配置、本地数据与快捷键。</DialogDescription></DialogHeader>
      <Tabs defaultValue="appearance">
        <TabsList><TabsTrigger value="appearance"><Palette className="mr-1.5 h-3.5 w-3.5" />外观</TabsTrigger><TabsTrigger value="providers"><KeyRound className="mr-1.5 h-3.5 w-3.5" />模型配置</TabsTrigger><TabsTrigger value="data"><Database className="mr-1.5 h-3.5 w-3.5" />本地数据</TabsTrigger><TabsTrigger value="shortcuts"><Keyboard className="mr-1.5 h-3.5 w-3.5" />快捷键</TabsTrigger></TabsList>
        <TabsContent value="appearance" className="space-y-4">
          <div><h3 className="text-sm font-semibold">界面主题</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">手动选择画布显示模式，设置只保存在当前设备。</p></div>
          <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="界面主题">
            <ThemeOption value="light" current={theme} icon={Sun} title="浅色模式" description="明亮的白灰工作区" onSelect={setTheme} />
            <ThemeOption value="dark" current={theme} icon={Moon} title="黑夜模式" description="低亮度深灰工作区" onSelect={setTheme} />
          </div>
        </TabsContent>
        <TabsContent value="providers" className="max-h-[64vh] space-y-5 overflow-y-auto pr-1">
          <div><h3 className="text-sm font-semibold">内置模型服务</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">只需保存厂商 API Key，该厂商的图片与视频模型会立即出现在画布节点中。密钥只保存在本机加密凭据库。</p></div>
          {providers.map((provider) => <div key={provider.id} className="rounded-xl border border-border bg-muted/25 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-background p-2">{provider.logoPath ? <img src={provider.logoPath} alt="" className="h-full w-full object-contain dark:invert" /> : <Sparkles className="h-4 w-4" />}</div>
                <div className="min-w-0"><div className="flex flex-wrap items-center gap-2 text-sm font-semibold">{provider.displayName}{provider.configured ? <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/55 dark:text-emerald-300"><Check className="mr-1 h-3 w-3" />已就绪</Badge> : <Badge>未配置</Badge>}<Badge>{provider.modelCount ?? 0} 个模型</Badge></div><p className="mt-1 text-[11px] leading-5 text-muted-foreground">{provider.description}</p><div className="mt-1 text-[10px] text-muted-foreground">{provider.requiresCredential ? `加密后端：${provider.backend}${provider.secure ? '' : '（预览/弱后端）'}` : '无需凭据 · 完全离线'}</div></div>
              </div>
              {provider.configured && provider.requiresCredential ? <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-red-600" onClick={() => void remove(provider.id)} disabled={busy === provider.id}><Trash2 className="h-4 w-4" /></Button> : null}
            </div>
            {provider.modelNames?.length ? <div className="mt-3 flex flex-wrap gap-1.5">{provider.modelNames.map((name) => <span key={name} className="rounded-md border border-border/70 bg-background/65 px-2 py-1 text-[10px] text-muted-foreground">{name}</span>)}</div> : null}
            {provider.requiresCredential ? <div className="mt-3 flex gap-2"><Input type="password" autoComplete="off" value={secrets[provider.id] ?? ''} onChange={(event) => setSecrets((current) => ({ ...current, [provider.id]: event.target.value }))} placeholder={provider.configured ? '已配置 · 输入新值可覆盖' : provider.credentialPlaceholder ?? '粘贴 API Key'} /><Button onClick={() => void save(provider.id)} disabled={!secrets[provider.id]?.trim() || busy === provider.id}>{busy === provider.id ? <Loader2 className="h-4 w-4 animate-spin" /> : '保存'}</Button>{provider.configured ? <Button variant="outline" onClick={() => void test(provider.id)} disabled={busy === provider.id}>测试</Button> : null}</div> : null}
            {result[provider.id] ? <p className="mt-2 text-[11px] text-muted-foreground">{result[provider.id]}</p> : provider.lastTest ? <p className="mt-2 text-[11px] text-muted-foreground">上次测试：{provider.lastTest.message}</p> : null}
          </div>)}
          <Separator />
          <ModelConfigurationPanel />
        </TabsContent>
        <TabsContent value="data">
          <div className="grid gap-3 sm:grid-cols-2">
            <InfoCard icon={ShieldCheck} title="本机加密" text="模型密钥通过系统凭据能力加密，Renderer 无法读取明文。" />
            <InfoCard icon={CloudOff} title="无云端同步" text="项目、运行记录与生成素材只存放在 Electron userData 目录。" />
            <InfoCard icon={Database} title="SQLite + WAL" text="项目图使用 revision CAS 保存，避免旧快照覆盖新结果。" />
            <InfoCard icon={Sparkles} title="素材本地化" text="生成结果下载后转为本地 Asset，断网仍可查看既有作品。" />
          </div>
        </TabsContent>
        <TabsContent value="shortcuts" className="max-h-[58vh] space-y-5 overflow-y-auto pr-1">
          <p className="text-xs leading-5 text-muted-foreground">快捷键在输入框、文本域或可编辑内容聚焦时不会触发；空格键也会避开按钮、链接和标签页，保留控件的原生键盘操作。</p>
          {APP_SHORTCUT_GROUPS.map((group) => <section key={group.title}>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[.14em] text-muted-foreground">{group.title}</h3>
            <div className="overflow-hidden rounded-xl border border-border bg-muted/20">
              {group.shortcuts.map((shortcut, index) => <div key={`${group.title}-${shortcut.label}`} className={index ? 'flex items-center gap-4 border-t border-border/70 px-4 py-3' : 'flex items-center gap-4 px-4 py-3'}>
                <div className="flex min-w-[190px] flex-wrap items-center gap-1.5">
                  {shortcut.keys.map((key) => <kbd key={key} className="rounded-md border border-border bg-card px-2 py-1 text-[10px] font-semibold text-foreground shadow-sm">{key}</kbd>)}
                </div>
                <div className="min-w-0"><div className="text-xs font-semibold">{shortcut.label}</div><div className="mt-0.5 text-[11px] leading-5 text-muted-foreground">{shortcut.description}</div></div>
              </div>)}
            </div>
          </section>)}
        </TabsContent>
      </Tabs>
    </DialogContent>
  </Dialog>;
}

function ThemeOption({ value, current, icon: Icon, title, description, onSelect }: {
  value: AppTheme;
  current: AppTheme;
  icon: LucideIcon;
  title: string;
  description: string;
  onSelect(theme: AppTheme): void;
}) {
  const selected = current === value;
  return <button
    type="button"
    role="radio"
    aria-checked={selected}
    onClick={() => onSelect(value)}
    className={selected
      ? 'rounded-xl border border-foreground/45 bg-accent p-3 text-left ring-2 ring-ring/20 transition'
      : 'rounded-xl border border-border bg-muted/20 p-3 text-left transition hover:bg-accent/70'}
  >
    <div className={value === 'dark' ? 'mb-3 overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 p-2' : 'mb-3 overflow-hidden rounded-lg border border-zinc-200 bg-white p-2'}>
      <div className={value === 'dark' ? 'mb-2 h-2 rounded bg-zinc-800' : 'mb-2 h-2 rounded bg-zinc-200'} />
      <div className="flex gap-1.5">
        <div className={value === 'dark' ? 'h-10 w-5 rounded bg-zinc-800' : 'h-10 w-5 rounded bg-zinc-100'} />
        <div className={value === 'dark' ? 'h-10 flex-1 rounded border border-zinc-800 bg-zinc-900' : 'h-10 flex-1 rounded border border-zinc-200 bg-zinc-50'} />
      </div>
    </div>
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="min-w-0"><span className="block text-xs font-semibold">{title}</span><span className="mt-0.5 block text-[10px] text-muted-foreground">{description}</span></span>
      {selected ? <Check className="ml-auto h-4 w-4 shrink-0 text-emerald-500" /> : null}
    </div>
  </button>;
}

function InfoCard({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return <div className="rounded-xl border border-border bg-muted/25 p-4"><Icon className="h-5 w-5 text-primary" /><h3 className="mt-3 text-sm font-semibold">{title}</h3><p className="mt-1.5 text-xs leading-5 text-muted-foreground">{text}</p></div>;
}
