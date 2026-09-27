# README 脚本与开发调试指南规格

## 目标

在根目录 README 中补全当前仓库可用脚本的功能、执行链路和使用场景，并提供与现有 Electron、Vite、Vitest 和本地数据边界一致的开发调试指南。

## 脚本说明范围

- 覆盖根 `package.json` 暴露的 `dev`、`dev:renderer`、`build`、`build:renderer`、`build:desktop`、`typecheck`、`test`、`test:runtime`、`test:watch`、`verify` 和 `dist`。
- 补充 Renderer 工作区的 `preview` 用法，但明确它需要先生成生产构建。
- 对组合脚本说明其子步骤、输出目录、是否持续运行、是否使用真实桌面能力，以及失败时应优先检查的层级。
- 不记录仓库中不存在的脚本、环境变量或自动化能力。

## 开发调试指南范围

- 说明 Node.js、pnpm、依赖安装和日常启动流程。
- 区分浏览器预览与完整 Electron 开发模式：浏览器预览只使用内存适配器，完整模式才覆盖 IPC、SQLite、素材、凭据和运行恢复。
- 说明 Renderer 支持 Vite 热更新，而 Main/Preload 改动需要重新执行桌面构建并重启 Electron。
- 说明 Renderer、Main/Preload、共享业务模块和 Runtime smoke 的分层调试入口。
- 提供单文件测试、按测试名筛选和 watch 模式示例。
- 提供 Electron Main 的 Node Inspector 启动示例，并说明 Renderer 控制台和主进程终端的日志归属。
- 记录开发模式使用的稳定 `userData` 位置、数据内容及操作前备份要求。
- 收录端口占用、浏览器预览能力缺失、桌面代码未刷新和 runtime 执行环境错误等常见问题的排查方向。

## 验收

- README 中的每个命令都可以从当前 `package.json` 或 Renderer 工作区脚本追溯。
- `dev`、`verify`、`test:runtime` 和 `dist` 的执行顺序与当前脚本定义一致。
- 数据目录、构建输出和热更新边界与当前源码配置一致。
- 文档不会暗示浏览器预览具备 Electron 本地能力，也不会建议用系统 Node 直接运行依赖 Electron Node runtime 的 smoke 脚本。
- 文档修改通过仓库现有的类型检查、测试、构建和 runtime smoke 验证。
