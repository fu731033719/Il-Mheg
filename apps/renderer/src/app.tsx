import { useEffect } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { CanvasWorkspace } from '@/components/canvas-workspace';
import { Inspector } from '@/components/inspector';
import { Sidebar } from '@/components/sidebar';
import { Topbar } from '@/components/topbar';
import { ThemeProvider } from '@/components/theme-provider';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useCanvasStore } from '@/store/canvas-store';

export function App() {
  const initialize = useCanvasStore((state) => state.initialize);
  const initialized = useCanvasStore((state) => state.initialized);
  const loading = useCanvasStore((state) => state.loading);
  const notice = useCanvasStore((state) => state.notice);
  const dismiss = useCanvasStore((state) => state.dismissNotice);
  useEffect(() => { if (!initialized) void initialize(); }, [initialize, initialized]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(dismiss, 5200); return () => clearTimeout(timer); }, [notice, dismiss]);

  return <ThemeProvider><TooltipProvider delayDuration={350}>
    <div className="flex h-full w-full bg-background text-foreground transition-colors duration-200">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="relative flex min-h-0 flex-1">
          <CanvasWorkspace />
          <Inspector />
        </main>
      </div>
      {loading ? <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/78 backdrop-blur-sm"><div className="flex flex-col items-center gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10"><span className="h-4 w-4 animate-ping rounded-full bg-primary" /></div><span className="text-xs text-muted-foreground">正在载入本地画布</span></div></div> : null}
      {notice ? <div className="fixed bottom-5 left-1/2 z-[90] flex min-w-[320px] -translate-x-1/2 items-center gap-2 rounded-xl border border-border bg-popover px-3 py-2.5 text-sm shadow-panel">{notice.kind === 'error' ? <AlertCircle className="h-4 w-4 text-red-600" /> : notice.kind === 'success' ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Info className="h-4 w-4 text-primary" />}<span className="flex-1">{notice.message}</span><Button variant="ghost" size="icon" className="h-7 w-7" onClick={dismiss}><X className="h-3.5 w-3.5" /></Button></div> : null}
    </div>
  </TooltipProvider></ThemeProvider>;
}
