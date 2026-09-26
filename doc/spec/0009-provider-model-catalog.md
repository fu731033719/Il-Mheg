# 0009 · 多厂商生成模型目录与零代码接入

## 背景

应用当前仅内置 OpenAI 图片、通义万相视频和本地演示模型。用户需要在桌面端只配置本地 API Key，便可选择并调用主流图片/视频生成模型，同时看到厂商标识和该模型真实可用的参数预设。

“全网所有模型”不能依靠一次性硬编码或运行时爬虫保证完整性：模型标识、权限、参数和下线状态会持续变化，且部分平台不提供公开目录 API。本次把目录改造成版本化、可扩展的声明式清单，并交付用户点名厂商的首批可执行适配；后续新增同协议模型只需要补充 manifest，不改画布、编译器或运行调度器。

## 目标

1. 内置模型服务覆盖 OpenAI、xAI、Google、MiniMax、火山方舟、阿里云百炼和 fal。
2. 首批模型覆盖 GPT Image、Grok Imagine、Gemini / Nano Banana、Veo、MiniMax / Hailuo、Seedance、HappyHorse 和 Wan。
3. 每个厂商展示本地打包的品牌标识、用途说明、接入文档入口提示和已内置模型数量。
4. 每个模型由 manifest 声明能力、输入图片数量、端点、同步/异步方式以及参数字段；Inspector 直接渲染这些预设。
5. 用户保存一个厂商 API Key 后，该厂商全部内置模型立即出现在相应画布节点的模型列表中。
6. API Key 只通过现有主进程凭据库保存、读取和注入，Renderer 永远拿不到明文。
7. 保留自定义 OpenAI-compatible 图片模型与 DashScope-compatible 视频模型能力。

## 非目标

- 不在客户端后台爬取任意网页或执行不受信任的远程 manifest。
- 不宣称未公开 API、未获得账号权限或已下线的模型一定可调用。
- 不实现语言、语音节点执行。
- 不上传密钥、目录配置、运行记录或素材到 ILMheg 自有服务。

## 目录模型

### Provider manifest

Provider 声明以下稳定元数据：

- `id`、显示名称、API Base URL；
- 本地 Logo 路径、简短说明和凭据占位提示；
- 凭据测试路径和认证方式；
- 是否需要凭据。

Provider 状态 IPC 向 Renderer 返回公开元数据、配置状态和内置模型数，不返回 Base URL 或密钥。

### Model manifest

Model 声明：

- 稳定内部 ID、上游 model ID、厂商、图片/视频类型和说明；
- 一个或多个 endpoint；
- 每个 endpoint 的能力、输入数量限制、视频输入模式、协议、路径、轮询路径和参数预设；
- 可选的上游 API 文档 URL，用于记录清单依据。

首批目录至少包括：

| 厂商 | 图片模型 | 视频模型 |
| --- | --- | --- |
| OpenAI | GPT Image 2.5 Sunburst、GPT Image 2.5 Flare、GPT Image 2 | — |
| xAI | Grok Imagine Image 2.0 | Grok Imagine Video 1.5 |
| Google | Nano Banana 2 Lite、Nano Banana 2、Nano Banana Pro、Nano Banana | Veo 3.1、Veo 3.1 Fast |
| MiniMax | Image-01 | Hailuo 2.3、Hailuo 2.3 Fast、Hailuo 02、H3 |
| 火山方舟 | — | Seedance 2.5、Seedance 2.0、Seedance 2.0 Mini |
| fal | — | HappyHorse 1.0（文生视频、图生视频、参考生视频） |
| 阿里云百炼 | — | 现有 Wan 目录 |

若某个平台需要账号侧 Endpoint ID 而不是公共 model ID，参数面板必须暴露该字段，并在说明中明确。

## 协议适配

新增协议必须继续实现统一的 `submit` / `poll` 接口：

- `xai-video`：Bearer 认证；提交 `/v1/videos/generations`，轮询 `/v1/videos/{taskId}`。
- `google-image`：`x-goog-api-key` 认证；调用 Gemini 原生图片生成接口并解析内联 Base64 图片。
- `google-video`：`x-goog-api-key` 认证；提交 Veo long-running operation，轮询 operation 并在主进程带认证下载结果。
- `minimax-image`：Bearer 认证；同步返回图片 URL/Base64。
- `minimax-video`：Bearer 认证；创建任务、查询任务，必要时解析文件下载 URL。
- `ark-video`：Bearer 认证；提交和查询视频生成任务；图片使用 data URL 作为 `image_url.url`。
- `fal-queue`：`Authorization: Key` 认证；提交队列任务，轮询状态与结果；路径由模型 endpoint manifest 给出。

网络返回的媒体仍交给 Asset Store 本地化；带认证的下载必须在 Adapter 内完成并返回 bytes，禁止把 API Key 拼接到持久化 URL。

## 界面

模型设置页分成：

1. “内置模型服务”：厂商 Logo、厂商名称、说明、模型数量、凭据状态、保存/覆盖/删除/测试。
2. “自定义模型”：保留现有高级配置表单。

画布 Inspector 只显示已经配置凭据的远程模型和无需凭据的本地模型；列表项显示模型名，选中后显示厂商与模型说明。参数控件由 manifest 自动生成。

## 安全与兼容

- Logo 必须随应用本地打包，不在 Renderer 加载远程图片。
- 所有网络请求在主进程执行。
- 既有模型 ID、项目图、运行快照和自定义模型记录继续可读。
- Provider 测试使用各厂商低成本只读端点；没有可靠只读端点时只验证认证端点可达，不触发生成计费。
- 错误继续映射为公开运行错误，不向 Renderer 泄露响应头、密钥或完整上游响应。

## 验收标准

1. 每个内置 endpoint 的默认参数都能通过 manifest 校验。
2. 用户只保存一个厂商 API Key，即可在对应图片/视频节点选择该厂商模型。
3. 对 xAI、Google、MiniMax、火山方舟和 fal 至少各有请求结构/响应解析单元测试。
4. Provider Logo 在断网环境可显示。
5. `pnpm typecheck`、`pnpm test`、Renderer/Desktop build 和 runtime smoke test 全部通过。

## 官方资料基线

清单以 2026-09-27 可访问的官方资料为基线：OpenAI Image API、xAI Imagine API、Google Gemini Image/Veo API、火山方舟 Video Generation API、MiniMax 开放平台与官方 CLI、fal 队列 API。模型是否对具体账号开放仍由对应厂商控制。
