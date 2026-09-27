# README 脚本与开发调试指南实现设计

## README 脚本入口

README 的“脚本命令速查”记录根 `package.json` 当前公开的全部脚本，并说明组合顺序、运行模式和产物位置。Renderer 工作区的 `preview` 作为生产 Renderer 的辅助检查入口单独记录，不与完整 Electron 开发模式混淆。

文档明确以下实际执行关系：

- `dev` 先执行一次 `build:desktop`，再由 `concurrently` 启动 Vite 和等待 `127.0.0.1:5173` 的 Electron。
- `build` 依次生成 Renderer 与 Main/Preload 产物。
- `verify` 依次执行类型检查、Vitest、生产构建和 runtime smoke。
- `dist` 在完整验证通过后才调用 Electron Builder，并将产物写入 `release/`。

## 开发调试边界

README 按现有实现区分两种前端运行方式：

- `dev:renderer` 不存在 Preload 注入，`platform.ts` 因此使用浏览器内存适配器；刷新会重建内存状态。
- `dev` 使用真实 Electron Main/Preload，覆盖 IPC、SQLite、AssetStore、CredentialVault 和 RunOrchestrator。

Vite 负责 Renderer 热更新。根开发脚本不会监听 `apps/desktop/src/main.ts` 或 `preload.ts` 并重新执行 esbuild，因此这两层的修改需要重启开发命令。

调试指南将日志入口分为 Renderer 开发者工具与 Main 终端，并提供分离启动 Vite 和带 Node Inspector 的 Electron Main 的命令。`build-electron.mjs` 已为 Main/Preload 生成 source map，所以 Inspector 可以映射 TypeScript 源码。

## 测试与数据说明

定向测试示例使用 pnpm 的直接参数透传形式：测试文件、`-t` 过滤器和 watch 文件路径直接写在脚本名之后。插入独立的 `--` 会被 Vitest 作为参数终止符保留，无法实现本文需要的筛选行为，因此文档不采用该形式。

桌面启动代码把 `userData` 固定到系统 `appData` 下的 `il-mheg-canvas`。README 记录各平台默认位置、`canvas.db` 与 `assets/` 的责任，并明确开发版会使用稳定数据目录。runtime smoke 则通过系统临时目录创建隔离的数据库和素材目录，并在结束时清理。

## 验证

- 单文件命令 `pnpm test packages/domain/src/domain.test.ts`：4 项测试通过。
- 测试名命令 `pnpm test -t "rejects cycles"`：1 项匹配测试通过，其余跳过。
- watch 参数形式以 `--run` 非交互执行验证：`canvas-navigation.test.ts` 的 3 项测试通过。
- `pnpm verify`：类型检查通过；17 个测试文件、68 项测试通过，1 个文件与 2 项测试按既有条件跳过；Renderer、Main/Preload 生产构建通过；runtime smoke 成功生成图片和视频素材并完成清理。
