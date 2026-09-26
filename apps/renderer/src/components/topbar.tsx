import { useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { isDesktop } from '@/lib/platform';
import { useCanvasStore } from '@/store/canvas-store';

export function Topbar() {
  const projects = useCanvasStore((state) => state.projects);
  const currentProjectId = useCanvasStore((state) => state.currentProjectId);
  const saving = useCanvasStore((state) => state.saving);
  const renameProject = useCanvasStore((state) => state.renameProject);
  const project = projects.find((item) => item.id === currentProjectId);
  const [name, setName] = useState(project?.name ?? '');
  useEffect(() => setName(project?.name ?? ''), [project?.id, project?.name]);
  return <header className="app-drag grid h-11 shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b border-border bg-card px-3">
    <div />
    <div className="app-no-drag flex min-w-0 items-center justify-center">
      <Input value={name} onChange={(event) => setName(event.target.value)} onBlur={() => project && name.trim() && name !== project.name && void renameProject(project.id, name)} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} className="h-7 w-[240px] border-transparent bg-transparent text-center text-[13px] font-medium shadow-none hover:border-border focus:border-border" aria-label="项目名称" />
    </div>
    <div className="app-no-drag flex items-center justify-end gap-2">
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />保存中</> : <><Check className="h-3.5 w-3.5 text-emerald-600" />已保存到本地</>}
      </div>
      {!isDesktop ? <Badge className="border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700 dark:border-amber-900 dark:bg-amber-950/55 dark:text-amber-300">浏览器预览</Badge> : null}
    </div>
  </header>;
}
