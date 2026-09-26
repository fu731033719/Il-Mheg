import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FolderOpen } from 'lucide-react';
import { fitContextMenuPosition, type ScreenPoint } from '@/lib/context-menu-position';

const MENU_SIZE = { width: 208, height: 52 };

interface ProjectContextMenuProps {
  point: ScreenPoint;
  projectName: string;
  onClose(): void;
  onRevealResources(): void;
}

export function ProjectContextMenu({ point, projectName, onClose, onRevealResources }: ProjectContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const position = fitContextMenuPosition(
    point,
    { width: window.innerWidth, height: window.innerHeight },
    MENU_SIZE,
  );

  useEffect(() => {
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    const closeOutside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    };
    const closeOnKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', closeOutside, true);
    window.addEventListener('keydown', closeOnKey);
    window.addEventListener('blur', onClose);
    window.addEventListener('resize', onClose);
    window.addEventListener('scroll', onClose, true);
    return () => {
      document.removeEventListener('pointerdown', closeOutside, true);
      window.removeEventListener('keydown', closeOnKey);
      window.removeEventListener('blur', onClose);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('scroll', onClose, true);
    };
  }, [onClose]);

  const revealResources = () => {
    onClose();
    onRevealResources();
  };

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={`${projectName} 项目菜单`}
      data-project-context-menu
      className="fixed z-[120] w-52 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-panel"
      style={{ left: position.x, top: position.y }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <button
        type="button"
        role="menuitem"
        className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm outline-none transition hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground"
        onClick={revealResources}
      >
        <FolderOpen className="h-4 w-4" />
        <span>打开本地资源目录</span>
      </button>
    </div>,
    document.body,
  );
}
