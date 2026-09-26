# 项目本地资源快捷入口实现

## Renderer 交互

- `Sidebar` 在展开项目行和收起后的项目图标上监听 `contextmenu`，保存触发项目的 ID、名称和指针位置；右键操作不会切换当前项目。
- `ProjectContextMenu` 作为独立组件通过 Portal 渲染到 `document.body`，避免受到项目滚动容器裁剪。菜单使用固定定位、`menu` / `menuitem` 语义，并在打开后聚焦操作项。
- `fitContextMenuPosition` 根据视口、菜单尺寸和安全边距约束弹层坐标。菜单在外部指针按下、`Esc`、窗口失焦、窗口尺寸变化、滚动、项目切换或侧栏形态变化时关闭。
- 菜单执行 `revealProjectResources(projectId)`；Store 调用桌面桥接 API，并沿用全局通知呈现失败信息。此操作不会切换项目或修改画布。

## 桌面边界

- 公共契约新增 `projects.revealResources` IPC 通道以及对应的 `CanvasDesktopApi.projects.revealResources(id)` 方法。
- Preload 仅转发项目 UUID，不向 Renderer 暴露文件系统路径或 Electron `shell`。
- 主进程使用 `IdSchema` 校验输入，并通过 `AppDatabase.hasProject` 确认项目存在。验证成功后，使用 `shell.openPath` 打开 `AssetStore.rootDirectory()` 返回的统一素材根目录；Electron 返回错误文本时转换为应用错误。
- 浏览器预览实现保持同形空操作，便于独立预览 Renderer。

## 已验证事实

- TypeScript 类型检查通过。
- Vitest 新增菜单边界约束及指定项目资源打开测试，共 51 项通过、2 项按既有 Node 版本条件跳过。
- Renderer 与 Desktop 生产构建通过。
- Electron 运行时冒烟测试通过。
- 1280 × 720 浏览器预览确认：展开侧栏和图标窄轨均可通过右键显示菜单，菜单获得键盘焦点、位置未溢出窗口，执行操作后正常关闭。
