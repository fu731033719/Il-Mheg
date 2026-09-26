# 0009 · 多厂商生成模型目录与零代码接入实现

## 实现结果

桌面端现在通过版本化的 Provider / Model manifest 提供 8 个内置服务分组（含本地演示引擎）、24 个图片或视频模型，并保留原有自定义模型配置能力。远程模型按厂商凭据状态启用；用户只需在“应用设置 → 模型配置”保存对应 API Key，即可在图片或视频节点中选择该厂商的全部内置模型。

本次内置目录覆盖：

- OpenAI：GPT Image 2.5 Sunburst、GPT Image 2.5 Flare、GPT Image 2；
- xAI：Grok Imagine Image 2.0、Grok Imagine Video 1.5；
- Google AI：Nano Banana 2 Lite、Nano Banana 2、Nano Banana Pro、Nano Banana、Veo 3.1、Veo 3.1 Fast；
- MiniMax：Image-01、Hailuo 2.3、Hailuo 2.3 Fast、Hailuo 02、H3；
- 火山方舟：Seedance 2.5、Seedance 2.0、Seedance 2.0 Mini；
- fal：HappyHorse 1.0 的文生视频、图生视频与参考生视频端点；
- 阿里云百炼：Wan 2.7 图生视频与参考生视频；
- 本地演示引擎：图片与异步视频链路各一个模型。

## 模块事实

### `packages/model-catalog`

- `manifest.ts` 定义 Provider、Model、Endpoint、Capability 和视频输入模式的显式类型边界。
- `providers.ts` 保存厂商名称、API Base URL、本地 Logo、凭据提示、认证方式、测试路径和官方文档入口。
- `models.ts` 保存模型能力、上游 model ID、端点路径、同步/异步模式、输入图片限制和参数预设。
- `presets.ts` 集中维护图片尺寸、质量、比例、时长、分辨率、输出数量、音频、水印和厂商专有参数。
- `index.ts` 负责把 manifest 转为 Renderer 可读的公开目录，并继续支持自定义 OpenAI-compatible 图片模型和 DashScope-compatible 视频模型。

### `packages/graph-compiler`

- 编译器根据节点类型、实际输入素材和视频模式选择兼容 endpoint。
- 模型选择没有固定 endpoint 时，首帧、首尾帧、参考图和纯文本输入会自动路由到相符的端点。
- 参数值在编译阶段合并默认值并通过 manifest 字段约束校验。

### `packages/provider-adapters`

- 新增 `xai-image`、`xai-video`、`google-image`、`google-video`、`minimax-image`、`minimax-video`、`ark-video` 和 `fal-queue` 协议实现。
- 所有协议继续实现统一的 `submit` / `poll` 边界，运行调度器无需了解厂商响应结构。
- xAI、MiniMax、火山方舟、fal 和既有 DashScope 使用各自的异步任务状态转换；图片响应统一转换为 Base64 或远程媒体输出。
- Veo 完成后由主进程携带 `x-goog-api-key` 下载视频字节，持久化 URL 不包含密钥。
- OpenAI 图片适配补齐透明背景参数传递。

### `apps/desktop`

- Provider 状态 IPC 返回 Logo、说明、凭据占位提示、官方文档、模型数量和模型名称，不返回密钥或厂商 Base URL。
- 保存凭据后，目录 IPC 仅公开该厂商已经启用的内置模型；本地演示模型始终可用。
- Provider 连通测试按 manifest 中的 Bearer、`x-goog-api-key` 或 `Key` 认证方式构造请求；无可靠只读测试端点的 fal 在保存时不触发付费生成。
- 生成请求和轮询继续在主进程中执行，凭据由现有本机 Credential Vault 在调用时注入。

### `apps/renderer`

- 模型配置页先展示内置模型服务，再展示高级自定义模型表单。
- 每张厂商卡片展示随应用打包的 SVG Logo、配置状态、说明、模型数量、模型名称和本地密钥操作。
- Inspector 在选中模型后显示厂商 Logo、厂商名称和模型说明；参数控件完全由 endpoint manifest 生成。
- 浏览器预览平台与桌面 IPC 返回相同的公开 Provider 元数据，便于开发时验证界面。

### `apps/renderer/public/providers`

本地打包 `local.svg`、`openai.svg`、`xai.svg`、`google.svg`、`minimax.svg`、`bytedance.svg`、`fal.svg` 和 `alibaba-cloud.svg`。Renderer 不依赖远程 Logo 地址。

## 安全与兼容性

- API Key 只通过凭据写入 IPC 进入主进程；已保存的密钥不会通过公开状态或目录 IPC 回传 Renderer。
- 上游媒体仍由 Asset Store 本地化，既有项目图、运行快照、模型 ID 和自定义模型记录保持兼容。
- Provider manifest 是应用内受版本控制的静态数据，不在运行时抓取或执行远程配置。

## 验证

- `pnpm typecheck` 通过；
- `pnpm test` 通过：62 个测试中 60 个通过、2 个按环境跳过；
- Renderer 与 Desktop production build 通过；
- runtime smoke test 通过；
- 本地浏览器视觉检查确认模型配置页 Logo、厂商分组、模型清单、密钥输入，以及图片节点的模型参数面板均正常渲染。

没有使用真实付费 API Key 发起在线生成；厂商请求结构、认证头、轮询状态和响应解析由单元测试覆盖，账号权限与最终可用模型仍由各厂商控制。
