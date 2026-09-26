# 项目总览、Harness 与路线图文档规格

状态：确认实施

日期：2026-09-27

## 1. 目标

扩充根目录 `README.md`，使其能独立回答以下问题：

1. 伊尔美格是什么，当前处于什么阶段。
2. 项目为什么采用当前的本地优先、图编译和 Electron 进程边界。
3. Monorepo 各目录和核心模块的责任、依赖方向与扩展点。
4. 当前所谓 Harness 具体包含哪些执行与验证能力，以及它不包含什么。
5. 未来按什么顺序推进，每个阶段如何判定完成。

## 2. 命名

- 中文名：伊尔美格。
- 英文名：Il Mheg。
- 当前桌面应用标识：`ILMhegAgent`。

本次只增加项目说明，不改变 Electron 应用名、包名、应用 ID 或用户数据目录。

## 3. 事实边界

README 中的“当前能力”必须与仓库已实现代码一致：

- 桌面进程边界为 Renderer / Preload / Main。
- 执行主链路为图持久化、图编译、Provider 适配、任务编排、结果本地化和运行事件。
- 已有 Mock、OpenAI Images 和 DashScope/Wan 协议适配能力。
- 已有 Vitest 测试、生产构建和 Electron Node 运行时冒烟链路。
- 真实付费 Provider 调用、完整 UI E2E、签名/公证、多平台发行不得写成已完成能力。

## 4. Harness 定义

当前仓库没有独立的 `harness/` 目录。Harness 是一组横跨模块的能力集合，为模型运行提供稳定的输入、执行、恢复、隔离和验证边界。README 应分层说明：

- 契约 Harness：Zod DTO 与白名单 IPC。
- 图语义 Harness：领域不变量、binding 与无环校验。
- 编译 Harness：把持久图编译为 Provider 无关的标准输入。
- Provider Harness：manifest、参数校验、adapter 提交/轮询协议和 Mock 故障注入。
- Runtime Harness：同步/异步任务、取消、重试、恢复、迟到结果防写回和事件发布。
- 数据与安全 Harness：SQLite CAS、事务提交、素材原子落盘、凭据加密和公共边界脱敏。
- 验证 Harness：单元/集成测试、构建和真实 Electron Node 运行时冒烟。

## 5. 文档结构

README 应包含：

- 一句话定位和项目原则。
- 当前能力和当前边界。
- 从 UI 到 Provider 和本地存储的运行链路。
- 包含根目录、`apps/`、`packages/`、`scripts/`、`doc/` 的目录说明。
- Harness 能力、当前验证覆盖和明确缺口。
- 新增 Provider/协议时的扩展路径。
- 无硬编码日期的阶段性路线图，并给出每阶段的出口标准。
- 现有本地运行、验证和打包命令。

## 6. 验收

- README 中出现中文名“伊尔美格”，并保留现有英文桌面应用标识说明。
- 目录说明覆盖当前所有一级源码模块，没有将 `dist/`、`release/` 或 `.tmp/` 写成源码目录。
- Harness 说明同时包含已实现项和尚未覆盖项。
- 路线图使用“计划/目标”语气，不将未实现内容写成技术事实。
- 文档修改后执行与本次风险匹配的验证。
