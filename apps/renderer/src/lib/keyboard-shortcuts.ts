export type ShortcutItem = {
  keys: readonly string[];
  label: string;
  description: string;
};

export type ShortcutGroup = {
  title: string;
  shortcuts: readonly ShortcutItem[];
};

export const APP_SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  {
    title: '导航',
    shortcuts: [
      { keys: ['左键', '拖动'], label: '平移画布', description: '在画布空白处按住左键拖动。' },
      { keys: ['触摸板', '双指移动'], label: '平移画布', description: '双指横向、纵向或斜向移动，无需按压。' },
      { keys: ['滚轮 / 触摸板捏合'], label: '缩放画布', description: '以指针或手势位置为中心缩放。' },
      { keys: ['Shift', 'Tab'], label: '切换左侧栏', description: '快速收起或展开项目侧栏。' },
      { keys: ['Space'], label: '适配画布视口', description: '将全部节点重新居中并缩放到可见区域。' },
      { keys: ['Shift', '单击'], label: '多选节点', description: '在当前选择中添加或移除节点。' },
    ],
  },
  {
    title: '编辑',
    shortcuts: [
      { keys: ['⌘ / Ctrl', 'Z'], label: '撤销', description: '撤销上一次画布编辑。' },
      { keys: ['⌘ / Ctrl', 'Shift', 'Z'], label: '重做', description: '恢复最近一次撤销的编辑。' },
      { keys: ['⌘ / Ctrl', 'C'], label: '复制节点', description: '复制当前选中的节点。' },
      { keys: ['⌘ / Ctrl', 'V'], label: '粘贴节点', description: '粘贴已复制的节点并产生偏移。' },
      { keys: ['⌘ / Ctrl', 'D'], label: '创建副本', description: '直接复制当前选中的节点。' },
      { keys: ['Delete / Backspace'], label: '删除', description: '删除当前选中的节点或连线。' },
    ],
  },
];

export function isTextEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]'));
}

export function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('button, a[href], summary, [role="button"], [role="tab"], [role="menuitem"], [role="option"], [role="checkbox"], [role="radio"]'));
}
