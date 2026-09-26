# 项目总览、Harness 与路线图文档设计

状态：已实现并验证

日期：2026-09-27

本文档记录根目录项目说明的已落地事实。对应规格见 `doc/spec/0008-project-overview-and-roadmap.md`。

## 1. 命名与定位

`README.md` 现在以“伊尔美格（Il Mheg）”为项目名，并单独标明当前 Electron 桌面应用标识仍为 `ILMhegAgent`。本次没有修改 `package.json` 的包名、`productName`、`appId` 或用户数据路径。

项目定位补充了“图是可执行源数据”这一核心差异，说明画布中的节点与 binding 会先被持久化和编译，再进入 Provider 无关的运行链路。

## 2. 架构与目录说明

README 新增了两层架构说明：

- 运行架构从 Renderer、Preload 和 Main 开始，展示图编译、任务编排、Provider 适配、数据库、素材和凭据库的组合关系。
- 单次运行链路从“Renderer 先保存图”开始，直到事务提交和脱敏运行事件返回 Renderer。

目录树现在覆盖 `apps/`、所有 `packages/` 一级包、`scripts/`、`doc/`、`build/` 和根目录工程配置。其中明确将 `dist/`、`release/`、`.tmp/` 和 `node_modules/` 标记为生成或安装产物，避免将它们视为源码边界。

模块责任表同时说明各层“应负责”和“不应负责”的内容，使后续扩展可以继续遵守 UI、领域、协议、运行时和存储之间的现有边界。

## 3. Harness 说明

README 中的 Harness 被定义为横跨多个包的执行与验证底座，而不是一个实际存在的 `harness/` 目录。文档按以下层次对应现有实现：

- 契约与公开数据边界。
- 图语义和决定性编译。
- Provider manifest 与 adapter 提交/轮询协议。
- Run 状态机、取消、重试、恢复和事件。
- SQLite、素材和凭据安全边界。
- Vitest、生产构建和 Electron Node runtime smoke。

文档另外记录了 Harness 尚未覆盖的部分，包括 Provider conformance suite、完整桌面 UI E2E、真实付费 Provider 自动调用、完整故障模拟和发行签名/升级回归。Mock 异步视频结果也被准确说明为可动预览占位素材，而不是真实编码视频。

## 4. 扩展与路线图

README 新增 Provider 协议扩展步骤，把 manifest、图编译、adapter、契约测试和 runtime 验证串为一条完整的接入路径，并保留“新协议不向 Renderer 注入厂商分支”的边界。

路线图按以下顺序组织：

1. 已具备的本地创作基线。
2. Harness 系统化。
3. 创作工作流完善。
4. Provider 生态扩展。
5. 发行级可靠性。
6. 长期候选的跨设备/协作能力。

除第一阶段外，其余内容均以“下一优先级”、“计划”或“长期候选”标记，并且每个阶段都附有可检查的出口标准。路线图没有使用未确认的交付日期。

## 5. 验证结果

2026-09-27 执行 `pnpm verify` 通过：

- TypeScript 全仓类型检查通过。
- Vitest：15 个测试文件通过、1 个跳过；51 项测试通过、2 项跳过。
- Renderer 生产构建通过。
- Electron Main/Preload 构建通过。
- Electron Node runtime smoke 通过，实际生成图片和视频预览素材并成功回写。

本次变更仅修改文档，未修改任何产品运行时代码。
