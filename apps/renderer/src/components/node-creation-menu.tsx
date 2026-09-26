import { Clapperboard, Image as ImageIcon, MessageSquareText, Plus, X } from 'lucide-react';
import type { CanvasNodeKind } from '@ilmheg/contracts';
import type { ConnectionNodeMenu } from '@/hooks/use-node-connection-interaction';
import { connectionOptions, type ExecutableNodeKind } from '@/lib/node-connections';

const optionDetails = {
  prompt: { label: '提示词', description: '继续补充创作指令', icon: MessageSquareText },
  image: { label: '图片生成', description: '生成或继续编辑画面', icon: ImageIcon },
  video: { label: '视频生成', description: '让静态画面动起来', icon: Clapperboard },
} satisfies Record<Exclude<CanvasNodeKind, 'group'>, { label: string; description: string; icon: typeof Plus }>;

export const executableNodeKinds = ['prompt', 'image', 'video'] as const satisfies readonly ExecutableNodeKind[];

export function NodeCreationMenu({
  menu,
  onCreate,
  onClose,
}: {
  menu: ConnectionNodeMenu;
  onCreate(kind: Exclude<CanvasNodeKind, 'group'>): void;
  onClose(): void;
}) {
  const options = connectionOptions(menu.originKind, menu.side);
  return <NodeTypeMenu
    title="连接新节点"
    ariaLabel="连接新节点"
    options={options}
    position={menu.position}
    onCreate={onCreate}
    onClose={onClose}
  />;
}

export function CanvasNodeCreationMenu({
  position,
  onCreate,
  onClose,
}: {
  position: { x: number; y: number };
  onCreate(kind: ExecutableNodeKind): void;
  onClose(): void;
}) {
  return <NodeTypeMenu
    title="创建节点"
    ariaLabel="创建节点"
    options={executableNodeKinds}
    position={position}
    onCreate={onCreate}
    onClose={onClose}
    contextMenu
  />;
}

function NodeTypeMenu({
  title,
  ariaLabel,
  options,
  position,
  onCreate,
  onClose,
  contextMenu = false,
}: {
  title: string;
  ariaLabel: string;
  options: readonly ExecutableNodeKind[];
  position: { x: number; y: number };
  onCreate(kind: ExecutableNodeKind): void;
  onClose(): void;
  contextMenu?: boolean;
}) {
  return <div
    className="nodrag nopan absolute z-40 w-[220px] overflow-hidden rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-panel"
    style={{ left: position.x, top: position.y }}
    role="menu"
    aria-label={ariaLabel}
    data-canvas-context-menu={contextMenu ? '' : undefined}
    onPointerDown={(event) => event.stopPropagation()}
    onClick={(event) => event.stopPropagation()}
    onContextMenu={(event) => event.preventDefault()}
  >
    <div className="flex h-8 items-center gap-2 px-2 text-[11px] font-semibold text-muted-foreground">
      <Plus className="h-3.5 w-3.5" />
      <span>{title}</span>
      <button type="button" className="ml-auto rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground" onClick={onClose} aria-label="关闭节点菜单">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
    <div className="space-y-0.5">
      {options.map((kind) => {
        const details = optionDetails[kind];
        const Icon = details.icon;
        return <button
          key={kind}
          type="button"
          role="menuitem"
          className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
          onClick={() => onCreate(kind)}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground"><Icon className="h-4 w-4" /></span>
          <span className="min-w-0">
            <span className="block text-xs font-medium text-foreground">{details.label}</span>
            <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{details.description}</span>
          </span>
        </button>;
      })}
    </div>
  </div>;
}
