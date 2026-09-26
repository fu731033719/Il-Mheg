import { useCallback, useEffect, useState, type MouseEvent } from 'react';
import { FolderKanban, PanelLeftClose, PanelLeftOpen, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProjectContextMenu } from '@/components/project-context-menu';
import { SettingsDialog } from '@/components/settings-dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { isTextEditingTarget } from '@/lib/keyboard-shortcuts';
import { useCanvasStore } from '@/store/canvas-store';
import { cn } from '@/lib/utils';

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [projectMenu, setProjectMenu] = useState<{ projectId: string; projectName: string; x: number; y: number } | null>(null);
  const projects = useCanvasStore((state) => state.projects);
  const currentProjectId = useCanvasStore((state) => state.currentProjectId);
  const selectProject = useCanvasStore((state) => state.selectProject);
  const createProject = useCanvasStore((state) => state.createProject);
  const removeProject = useCanvasStore((state) => state.removeProject);
  const revealProjectResources = useCanvasStore((state) => state.revealProjectResources);
  const closeProjectMenu = useCallback(() => setProjectMenu(null), []);

  const openProjectMenu = (event: MouseEvent, projectId: string, projectName: string) => {
    event.preventDefault();
    event.stopPropagation();
    setProjectMenu({ projectId, projectName, x: event.clientX, y: event.clientY });
  };

  useEffect(() => {
    const toggleWithShortcut = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !event.shiftKey || event.metaKey || event.ctrlKey || event.altKey || isTextEditingTarget(event.target)) return;
      event.preventDefault();
      setCollapsed((value) => !value);
    };
    window.addEventListener('keydown', toggleWithShortcut);
    return () => window.removeEventListener('keydown', toggleWithShortcut);
  }, []);

  useEffect(() => closeProjectMenu(), [closeProjectMenu, collapsed, currentProjectId]);

  return <aside id="project-sidebar" className={cn('relative z-20 flex shrink-0 flex-col border-r border-border bg-card transition-[width] duration-200 ease-out', collapsed ? 'w-16' : 'w-[232px]')}>
    <div className="app-drag h-11 shrink-0 border-b border-border" aria-hidden="true" />
    <div className={cn('flex h-14 shrink-0 items-center', collapsed ? 'justify-center px-2' : 'gap-2.5 px-3')}>
      <img src="./brand/il-mheg-logo.svg" alt="" aria-hidden="true" draggable={false} className="h-8 w-7 shrink-0 object-contain dark:invert" />
      {!collapsed ? <div className="min-w-0"><div className="truncate text-[13px] font-semibold tracking-tight">Il Mheg</div><div className="text-[8px] uppercase tracking-[.18em] text-muted-foreground">generative agent</div></div> : null}
    </div>
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline" size="icon" className="app-no-drag absolute -right-3 top-[60px] z-30 h-6 w-6 rounded-full bg-card shadow-sm" onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? '展开左侧边栏' : '收起左侧边栏'} aria-expanded={!collapsed} aria-controls="project-sidebar">
          {collapsed ? <PanelLeftOpen className="h-3 w-3" /> : <PanelLeftClose className="h-3 w-3" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">{collapsed ? '展开左侧边栏' : '收起左侧边栏'}</TooltipContent>
    </Tooltip>
    <div className={cn('flex h-10 shrink-0 items-center', collapsed ? 'justify-center px-2' : 'justify-between px-3.5')}>
      {!collapsed ? <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.16em] text-muted-foreground"><FolderKanban className="h-4 w-4" />项目</div> : null}
      <Tooltip>
        <TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => void createProject()} aria-label="新建项目"><Plus className="h-4 w-4" /></Button></TooltipTrigger>
        <TooltipContent side="right">新建项目</TooltipContent>
      </Tooltip>
    </div>
    <div className={cn('max-h-[45vh] space-y-1 overflow-y-auto pb-3', collapsed ? 'px-2' : 'px-2')}>
      {projects.map((project) => collapsed
        ? <Tooltip key={project.id}>
          <TooltipTrigger asChild>
            <button onClick={() => { closeProjectMenu(); void selectProject(project.id); }} onContextMenu={(event) => openProjectMenu(event, project.id, project.name)} className={cn('relative flex h-10 w-full items-center justify-center rounded-lg transition', currentProjectId === project.id ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground')} aria-label={`打开项目 ${project.name}`} aria-haspopup="menu">
              <FolderKanban className="h-4 w-4" />
              {currentProjectId === project.id ? <span className="absolute bottom-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_0_2px_rgba(52,211,153,.18)]" /> : null}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">{project.name}</TooltipContent>
        </Tooltip>
        : <div key={project.id} onContextMenu={(event) => openProjectMenu(event, project.id, project.name)} className={cn('group flex w-full items-center rounded-lg transition', currentProjectId === project.id ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
          <button onClick={() => { closeProjectMenu(); void selectProject(project.id); }} className="flex min-w-0 flex-1 items-center justify-between px-2.5 py-2 text-left text-sm" aria-haspopup="menu">
            <span className="truncate">{project.name}</span>
            {currentProjectId === project.id ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_0_2px_rgba(52,211,153,.18)]" /> : null}
          </button>
          {projects.length > 1 ? <button onClick={() => void removeProject(project.id)} className="mr-1 rounded p-1 opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 dark:hover:bg-red-950/55 dark:hover:text-red-300" aria-label={`删除项目 ${project.name}`}><Trash2 className="h-3.5 w-3.5" /></button> : null}
        </div>)}
    </div>
    <div className={cn('mt-auto border-t border-border/70 p-2', collapsed && 'flex justify-center')}>
      <SettingsDialog collapsed={collapsed} />
    </div>
    {projectMenu ? <ProjectContextMenu
      point={{ x: projectMenu.x, y: projectMenu.y }}
      projectName={projectMenu.projectName}
      onClose={closeProjectMenu}
      onRevealResources={() => void revealProjectResources(projectMenu.projectId)}
    /> : null}
  </aside>;
}
