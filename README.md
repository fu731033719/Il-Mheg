# 伊尔美格（Il Mheg）

> 一个本地优先、以无限画布组织 AI 图片与视频工作流的桌面创作工具。

**中文名：** 伊尔美格

**英文名：** Il Mheg

**当前桌面应用标识：** `ILMhegAgent`

伊尔美格不只是一个模型调用界面。它把提示词、图片、视频和它们之间的输入关系保存为可验证的图，再把图编译为与具体 Provider 无关的生成任务。项目图、运行记录、素材、生成结果和模型凭据均由 Electron 主进程在本机管理，不需要伊尔美格的平台账号或中转服务。

当前仓库是 `0.1.0` 阶段的可运行桌面端基线：核心画布、本地数据链路、Mock 运行链路和部分真实 Provider 协议已经落地；发行级 E2E、签名公证、大规模 Provider 覆盖和协作能力仍在未来路线中。

## 设计原则

- **本地优先**：项目数据、素材和凭据的默认归宿是用户本机，真实模型请求由 Main 直接发往对应 Provider。
- **图是可执行源数据**：节点和显式 binding 共同表达工作流，运行前统一校验和编译。
- **协议与产品解耦**：画布不理解厂商请求细节；模型 manifest、编译器和 adapter 承担差异。
- **边界可校验**：进程间 DTO、图结构、模型参数和公开运行记录都有显式类型与运行时校验。
- **先可恢复，再扩展**：异步任务、取消、重试、恢复和结果提交是执行底座的一等能力。

## 当前已实现能力

### 画布与创作

- React 19、React Flow、Zustand 与 Tailwind/shadcn 风格界面。
- 平移、缩放、框选、多选、MiniMap、分组、复制粘贴、撤销重做和领域层自动布局。
- `prompt`、`image`、`video`、`group` 四类节点。
- `prompt`、`source_image`、`first_frame`、`last_frame`、`reference_image` 等显式输入 binding。
- 属性面板配置提示词、模型、参数和输入引用，并可快速定位来源节点。
- 项目创建、切换、重命名、删除以及 450ms 防抖保存。

### 模型与运行

- 无需 API Key 的 Mock 文生图、图生图和异步图生视频预览链路。
- OpenAI GPT Image 2 文生图/图片编辑协议。
- 通义万相 Wan 2.7/3.0 的 DashScope 异步视频协议，包含文生、首尾帧和参考图输入模式。
- 自定义模型配置，以稳定 ID 绑定节点、Endpoint、模型类型和凭据。
- SQLite 持久化、图 revision 冲突保护、运行取消/重试/恢复以及远程结果本地化。
- API Key 使用 Electron `safeStorage` 加密；Renderer 只能看到是否已配置。

### 本地素材与桌面边界

- 本地图片导入、哈希与原子落盘。
- 通过 `canvas-asset://asset/<assetId>` 访问素材，Renderer 不持有真实文件路径。
- Renderer / Preload / Main 三层边界，启用隔离、沙箱和白名单 IPC。
- 远程结果下载拒绝回环、私网和本地域名，并限制结果大小。

## 运行架构

```text
用户操作
   │
   ▼
apps/renderer              React 画布、属性面板、Zustand 状态
   │  CanvasDesktopApi（受控 DTO）
   ▼
apps/desktop/preload       contextBridge 白名单桥接
   │
   ▼
apps/desktop/main          IPC 校验、组装本地服务、掌握凭据与文件系统
   │
   ├── domain + graph-compiler + model-catalog
   │          图不变量 → 标准生成输入 → 模型/端点能力
   │
   └── runtime + provider-adapters
              任务状态机 → 提交/轮询 → 结果物化
                  │
                  ├── persistence       SQLite、revision、事务
                  ├── asset-store       素材落盘与安全下载
                  └── credential-vault  safeStorage 凭据边界
```

一次节点运行的主链路是：

```text
Renderer 先保存当前图
→ Main 校验项目与 graph revision
→ GraphCompiler 收集 prompt、素材 binding 和模型参数
→ RunOrchestrator 创建并推进 Run
→ ProviderAdapter 同步返回结果，或创建远程任务并轮询
→ AssetStore 将结果物化为本地 Asset
→ Persistence 事务性提交 Run、节点输出和新 graph revision
→ Renderer 接收脱敏的 run.changed 事件
```

## 目录设计

```text
Il-Mheg/
├── apps/
│   ├── desktop/               Electron Main、Preload、IPC 与桌面安全边界
│   └── renderer/              React 画布应用
│       └── src/
│           ├── components/    界面组件、画布节点和属性面板
│           ├── hooks/         拖拽与连线等交互协调
│           ├── lib/           可独立测试的 UI/画布算法
│           └── store/         项目、图、选择、历史与保存编排
├── packages/
│   ├── contracts/             公共 DTO、Zod schema、IPC 通道与 Preload API
│   ├── domain/                图模型、连线不变量和编辑命令
│   ├── model-catalog/         Provider/Model/Endpoint/Parameter manifest
│   ├── graph-compiler/        持久图 → CanonicalGenerationInput
│   ├── provider-adapters/     Mock、OpenAI Images、DashScope 协议适配
│   ├── runtime/               任务编排、轮询、取消、重试、恢复与事件
│   ├── persistence/           SQLite migration、repository、CAS 与事务
│   ├── asset-store/           导入、哈希、原子落盘、下载与寻址
│   └── credential-vault/      safeStorage 加解密封装
├── scripts/                       Electron 构建、runtime smoke 和视觉检查脚本
├── doc/
│   ├── spec/                  实施前确认的技术规格
│   ├── design/                实施后经验证的技术事实
│   └── draft/                 需要进一步澄清的草案（有需要时创建）
├── build/                         品牌与打包输入资源
├── package.json                   全仓命令、桌面打包配置与共享依赖
├── pnpm-workspace.yaml            Monorepo 成员与安装约束
├── tsconfig.json                  严格 TypeScript 与工作区路径映射
└── vitest.config.ts               跨 apps/packages 的测试入口
```

`dist/`、`release/`、`.tmp/` 和 `node_modules/` 是构建或安装产物，不是架构源码的一部分。

### 模块边界为什么这样划分

| 层级 | 核心责任 | 不应承担的责任 |
| --- | --- | --- |
| `contracts` | 跨进程和跨包的公共语言 | 数据库、UI 或 Provider 实现 |
| `domain` | 纯图语义与编辑规则 | React、Electron、SQLite 和网络请求 |
| `model-catalog` | 声明模型能力、端点和参数 | 画布交互或任务调度 |
| `graph-compiler` | 将图决定性编译为标准输入 | 持久化、凭据解密或 HTTP 调用 |
| `provider-adapters` | 把标准输入翻译成厂商协议 | 管理项目图或 UI 状态 |
| `runtime` | 组合编译、凭据、adapter、持久化与素材 | 渲染界面或暴露厂商私有数据 |
| `persistence` / `asset-store` / `credential-vault` | 各自封装数据、文件与密钥存储 | 主动决定业务工作流 |
| `apps/desktop` | 桌面组装根和权限边界 | 把 Main 内部实现泄露给 Renderer |
| `apps/renderer` | 展示与用户交互 | 直接读写文件、SQLite 或明文凭据 |

这种分层让画布交互、执行状态机和厂商协议可以分别演进。新增 Provider 通常不需要修改 Renderer 的运行流程，新增画布交互也不应影响凭据和文件安全边界。

## Harness 能力

本项目的 **Harness** 指支撑“一个图节点可被稳定、可恢复、可验证地执行”的工程底座，而不是某个单独目录。它横跨 `contracts`、`domain`、`graph-compiler`、`model-catalog`、`provider-adapters`、`runtime` 和数据模块。

| Harness 层 | 当前能力 | 提供的保证 |
| --- | --- | --- |
| 契约 Harness | Zod schema、白名单 IPC、公开/内部 Run 分离 | 非法输入早失败，远程任务 ID 和输入快照不穿过公开边界 |
| 图语义 Harness | 节点类型、显式 binding、槽位去重、环检测、索引归一 | 同一张图有确定的输入语义 |
| 编译 Harness | prompt 合并、素材顺序、参数默认值/校验、模型能力检查 | Provider 收到的是可重现的标准输入，而不是 UI 临时状态 |
| Provider Harness | `submit` / `poll` adapter 协议、Mock、OpenAI Images、DashScope Video | 同步与异步 Provider 共用同一运行主链路 |
| Runtime Harness | Run 状态机、调度轮询、取消、重试、启动恢复、事件发布 | 应用重启或用户取消后，任务不会静默丢失或随意回写 |
| 数据 Harness | SQLite migration、graph revision CAS、Run/节点事务提交、素材原子落盘 | 旧图不覆盖新图，成功运行不留半提交状态 |
| 安全 Harness | Main 内解密、凭据状态脱敏、素材协议、安全下载 | Renderer 不接触明文 Key、绝对路径或任意本地网络地址 |
| 验证 Harness | Vitest、生产构建、Electron Node runtime smoke | 纯逻辑、组装产物和真实 SQLite/调度链路分层受检 |

### Harness 已能验证什么

- 用 Mock Provider 离线跑通同步图片和异步视频预览链路。
- Mock 图片由提示词与序号决定性生成，提示词包含 `[fail]` 时可注入确定失败。
- 验证节点运行前的保存顺序、图编译、自定义模型稳定 ID 和参数归一。
- 验证 OpenAI-compatible 图片请求、阿里云 MaaS 差异和 DashScope 异步视频请求映射。
- 在 Electron 自带的 Node 运行时中使用临时目录，实际创建 SQLite、素材仓库和调度器，完成生成结果回写后再自动清理。

### Harness 当前边界

- 还没有独立的 Provider conformance suite，新 adapter 的通用契约测试仍需系统化。
- 还没有完整桌面 UI E2E；当前 UI 主要由单元测试、生产构建和人工视觉检查覆盖。
- 真实付费 Provider 调用不是自动门禁，以避免密钥、账单和外部稳定性成为本地验证前置条件。
- Mock 视频链路生成的是可动预览占位素材，不是真实编码的视频文件。
- 时钟、轮询退避、网络抖动、限流和迟到结果的故障模拟还不够完整。
- macOS/Windows 代码签名、公证、自动更新与安装升级回归不在当前 Harness 中。

### 如何扩展一个 Provider 协议

1. 在 `model-catalog` 声明模型能力、端点协议、参数和默认值。
2. 在 `graph-compiler` 确认新能力如何从节点与 binding 编译为标准输入。
3. 在 `provider-adapters` 实现 `submit`；如果是异步协议，同时实现 `poll`。
4. 为 manifest、编译结果、请求映射、错误分类和敏感字段边界增加测试。
5. 将关键成功/失败链路纳入 runtime smoke 或专用的协议测试，然后再向 Renderer 暴露可用能力。

如果新模型完全兼容已有 OpenAI Images 或 DashScope Video 协议，可通过自定义模型配置复用现有 adapter；不同协议应增加独立 adapter，不应在 Renderer 中根据厂商名猜测请求格式。

## 本地运行

建议使用 Node.js 24 和 pnpm 10。

```bash
pnpm install
pnpm dev
```

仅快速检查 Renderer：

```bash
pnpm dev:renderer
```

浏览器预览使用内存适配器，不代表桌面端的 SQLite、凭据、文件和任务恢复能力。要验证完整功能，请运行 Electron。

### 基本使用

1. 从画布顶部工具栏添加提示词、图片或视频节点，也可在画布空白处右键创建。
2. 选中节点，在右侧填写提示词、选择模型并调整参数。
3. 从节点边缘拖出连线，绑定提示词、源图片、首帧、尾帧或参考图。
4. 选择图片/视频节点并点击“开始生成”。默认 Mock 模型可完全离线体验。
5. 如需真实模型，在“应用设置 → 模型服务/模型配置”中保存并测试 API Key。

应用数据写入 Electron 稳定的 `userData` 目录，主要包含 `canvas.db` 和 `assets/`。远程生成结果下载完成后会转为本地素材。

## 验证与打包

```bash
pnpm typecheck      # 全仓严格 TypeScript 检查
pnpm test           # Vitest 单元/集成测试
pnpm build          # Renderer + Main/Preload 生产构建
pnpm test:runtime   # Electron Node + 真实 SQLite/AssetStore/Runtime smoke
pnpm verify         # 依次执行上述四项
pnpm dist           # 验证后生成未签名安装产物
```

`pnpm test:runtime` 会在临时目录中验证自定义模型 CRUD/凭据关联、真实 SQLite、Mock 文生图、素材回写和异步图生视频链路，完成后清理临时数据。

`pnpm dist` 会先执行全量验证，再调用 Electron Builder。仓库已配置 macOS 的 DMG/ZIP 和 Windows 的 NSIS 目标，具体可生成的未签名产物取决于当前构建平台与工具链。正式发布仍需平台证书、签名、公证和安装升级验收。

## 推进路线

路线图表达当前建议顺序，不代表已承诺的交付日期。总体原则是：先增强 Harness 的可信度，再扩展工作流和 Provider 广度，最后进入发行与可选协作能力。

| 阶段 | 状态 | 推进重点 | 阶段出口 |
| --- | --- | --- | --- |
| 0. 本地创作基线 | 已具备 | 画布、本地存储、Mock、OpenAI Images、DashScope Video、安全凭据与基本运行恢复 | `pnpm verify` 可重复通过，离线主链路可运行 |
| 1. Harness 系统化 | 下一优先级 | Provider conformance suite、可组合故障注入、可控时钟/轮询、状态转换覆盖、桌面关键路径 E2E | 任一 adapter 可通过同一契约测试；取消、恢复、限流和迟到结果有自动化证据 |
| 2. 创作工作流完善 | 计划 | 工作流模板、批量/变体生成、运行历史对比、项目导入导出、更明确的资源管理 | 常见创作流程可复用、可迁移、可比较，不破坏旧项目 |
| 3. Provider 生态扩展 | 计划 | 适配器注册机制、协议版本化、更多图片/视频模型、能力协商与定制参数 | 新协议通过明确 adapter + manifest 接入，无需把厂商分支写入画布层 |
| 4. 发行级可靠性 | 计划 | 备份/恢复、迁移回滚、诊断包、macOS/Windows 签名公证、自动更新与安装升级回归 | 可安全升级和回滚，发行产物经跨平台验收 |
| 5. 可选的跨设备/协作 | 长期候选 | 可携项目包、可选同步、团队共享与权限边界 | 在不改变默认本地优先和凭据隔离的前提下提供显式可选能力 |

近期取舍上，优先提高一条已有链路的可测性、可观测性和恢复能力，而不是只增加 Provider 数量。只有当新协议具有明确契约、失败语义和自动化验证时，它才应进入默认可用目录。

## 文档索引

- 已确认的技术规格：[`doc/spec/`](doc/spec/)
- 已实现并验证的技术事实：[`doc/design/`](doc/design/)

规格用于说明“准备实现什么”，设计文档只记录“已经实现并验证了什么”。
