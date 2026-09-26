# Il Mheg 本地 AI 创作画布 MVP 技术规格

状态：确认实施  
日期：2026-09-26

## 1. 产品目标

构建一个纯本地 Electron 桌面应用，以无限画布串联文生图、图生图和图生视频工作流。应用不包含平台账号、计费、云同步、公共网关或 Web 服务；模型凭据由用户自带并只在 Electron Main 中解密使用。

首个可运行版本必须同时提供可离线验证的 Mock Provider 和真实 OpenAI 图片 Provider。视频执行采用可恢复的异步任务模型，默认通过 Mock Provider 验证完整链路；真实厂商可通过 manifest/adapter 扩展，不把厂商特例写入画布层。

## 2. 进程与安全边界

- Renderer：React、React Flow、Zustand、shadcn 风格 UI；不拥有 Node、文件系统、数据库或明文凭据权限。
- Preload：仅暴露按领域分组的白名单 API 和运行事件订阅。
- Main：独占 SQLite、素材目录、`safeStorage`、文件选择器和 Provider 网络请求。
- Electron 窗口启用 `contextIsolation`、`sandbox`、`webSecurity`，关闭 `nodeIntegration`，拒绝非应用导航和任意新窗口。
- 不启动 loopback 业务 HTTP 服务。素材通过 `canvas-asset://asset/<assetId>` 访问。

## 3. Monorepo 模块

```text
apps/desktop           Electron Main / Preload / IPC / 打包
apps/renderer          React Renderer 与 shadcn UI
packages/contracts     Zod IPC 与公共 DTO
packages/domain        图模型、不变量、命令、状态机
packages/model-catalog Provider / Model / Endpoint manifest
packages/graph-compiler 从持久图编译 CanonicalGenerationInput
packages/provider-adapters Mock 与 OpenAI 请求/响应适配
packages/persistence   node:sqlite migration 与 repositories
packages/credential-vault safeStorage 封装
packages/asset-store   素材导入、落盘、寻址
packages/runtime       RunOrchestrator 与事件总线
```

依赖方向保持单向：纯领域包不依赖 React/Electron/SQLite；Renderer 不导入 Main 实现。

## 4. 领域行为

### 4.1 节点

- `prompt`：提供提示词。
- `image`：可持有本地输入素材，也可作为文生图/图生图目标。
- `video`：作为图生视频目标。
- `group`：仅用于视觉组织，不参与执行边。

节点持久字段分为 `config`、`output`、`runtime`。节点只保存 `assetId`，禁止保存 Blob URL、data URL、绝对路径、密钥或原始 Provider 请求。

### 4.2 边

边必须含显式 binding：`prompt`、`source_image(index)`、`first_frame`、`last_frame` 或 `reference_image(index)`。连接时拒绝自连、重复槽位、非法节点组合和有向环；索引在保存前连续规范化。

### 4.3 编辑器

- 平移、缩放、MiniMap、适配视图、框选、多选和拖动。
- 创建、编辑、复制、粘贴、删除节点；连接和删除边。
- 撤销/重做只记录用户图命令，运行事件不进入历史。
- 自动布局与分组/解组。
- 450ms 防抖保存；切换项目和关闭前刷新保存队列。
- 保存队列的空刷新不得残留已完成 Promise 阻塞后续修改；运行节点前必须等待包含该节点的图保存成功，保存失败时禁止继续调用 `runs.start`。
- 右侧 Prompt Dock 提供提示词、模型、端点、参数、显式输入槽位、运行/取消/重试与错误展示。

## 5. 持久化

- SQLite 使用 WAL、foreign keys、busy timeout 和 `user_version` migration。
- 表：`projects`、`graphs`、`runs`、`assets`、`provider_settings`、`encrypted_credentials`、`model_configurations`。
- 自定义模型作为独立本地实体持久化，包含稳定 UUID、显示名称、上游模型名称、Endpoint、模型类型、视觉生成用途、视频输入模式和 LLM 厂商；API Key 只通过凭据库加密保存，不写入模型表或图快照。
- 图保存使用 `baseRevision` CAS；冲突返回结构化错误，禁止旧快照覆盖新快照。
- 素材按哈希和类型写入 `userData/assets`，先写临时文件再原子 rename。
- 凭据使用 Electron `safeStorage` 加密；公共 API 仅暴露 configured 状态，不提供读取明文接口。

## 6. 生成执行

统一流程：

```text
Renderer 请求 node run
→ Main 加载当前持久图并校验 revision
→ GraphCompiler 汇总 prompt 与显式素材槽位
→ 创建 QUEUED run
→ PREPARING / SUBMITTING
→ 同步输出进入 DOWNLOADING，异步输出进入 WAITING_REMOTE
→ 输出原子落为本地 Asset
→ 事务性更新 Run、节点输出与图 revision
→ 向 Renderer 发布脱敏事件
```

状态为 `QUEUED / PREPARING / SUBMITTING / WAITING_REMOTE / DOWNLOADING / SUCCEEDED / FAILED / CANCEL_REQUESTED / CANCELLED / CANCELLED_LOCAL_ONLY / INTERRUPTED`。重试总是创建新 Run。取消后的迟到结果不得写回图。

## 7. Provider 范围

### Mock

- 文生图：生成本地 SVG/PNG 风格占位作品。
- 图生图：验证输入素材并生成视觉上可区分的结果。
- 图生视频：异步等待后生成可展示的本地视频占位素材或明确的可恢复结果。
- 支持取消和确定性失败注入，供测试与无 Key 演示使用。

### OpenAI Images

- 文生图：`POST /v1/images/generations`，默认模型 `gpt-image-2`。
- 图生图：`POST /v1/images/edits` multipart，支持有序多图。
- 支持 base64 和 HTTPS URL 输出，结果统一本地化。
- 参数包含模型、尺寸、质量、输出格式和数量；不在 Renderer 传递 Authorization。

真实调用需要用户自行配置凭据和账户额度，不作为自动测试前置条件。

### 自定义模型目录

- 设置的“模型配置”允许新建、编辑和删除自定义模型，必填显示名称、上游模型名称、HTTP(S) Endpoint、LLM 厂商和模型类型，API Key 可选。视觉模型还必须明确生成用途（图片或视频）；视频用途必须明确输入模式（通用、文生视频、首帧/首尾帧或参考生视频）。
- 模型类型固定为：大语言模型、视觉模型、多模态模型、语音模型。当前节点映射为：大语言模型对应提示词节点；视觉模型按生成用途精确对应图片或视频节点；多模态模型对应提示词和图片节点；由于当前无语音节点，语音模型只在设置中管理。旧视觉配置迁移时根据模型名称和 Endpoint 识别明确的视频模型，其余保持图片用途，避免把图片模型错误暴露给视频节点。
- 每个节点保存的 `modelId` 必须精确指向目录中的一个稳定模型 ID；属性面板只列出与当前节点兼容且已配置的模型。已被节点引用的模型配置被删除后，节点保留原 ID 供诊断，界面明确提示重新选择，不自动改绑其他模型。
- 自定义视觉/多模态模型在图片节点上按 OpenAI Images 兼容请求与响应执行。Endpoint 可填完整接口地址，也可填以 `/v1` 结尾的 Base URL，后者自动补为 `/v1/images/generations`；`/edits` 端点使用 multipart 图生图。阿里云 Model Studio MaaS 的 `/compatible-mode/v1` 按官方兼容规范补全 `/images/generations`，图生图通过 JSON 顶层 `image` 字段传入 Data URL，不发送它不支持的 multipart、`quality` 或 `output_format`。其他协议需要独立 adapter，不在 Renderer 中猜测厂商请求格式。
- 自定义视频用途当前明确支持阿里云 Model Studio / DashScope 异步视频协议。可填写完整的 `/api/v1/services/aigc/video-generation/video-synthesis` 地址；若填写同一工作空间的 `/compatible-mode/v1` Base URL，Main 根据已选择的视频用途转换到官方原生视频提交路径，并使用 `/api/v1/tasks/{taskId}` 轮询。提交携带 `X-DashScope-Async: enable`；内部 `reference` 素材必须转换为 Provider 接受的 `reference_image`，首帧与尾帧保持 `first_frame`、`last_frame`。参数目录必须按上游模型区分：Wan 2.7 仅提供 `720P/1080P` 和 `16:9`、`9:16`、`1:1`、`4:3`、`3:4`；Wan 3.0 继续提供 `480P/720P/1080P`、`adaptive` 与 `21:9`。旧节点保存了当前模型不再接受的 select 值时，编译器兼容归一为该参数默认值。非 DashScope 视频协议在增加独立 adapter 前不得伪装为可执行模型。

## 8. UI 视觉与 shadcn

- 使用 Tailwind CSS 和仓库内 shadcn 风格组件（Button、Input、Textarea、Select、Dialog、Badge、Tabs、Tooltip、Separator）。
- 全部功能图标统一使用 `lucide-react`，不混用其他图标库或组件内联自绘 SVG；品牌 Logo 使用独立的透明背景 SVG 资源，不作为功能图标复用。
- 英文、数字和标点统一使用本地打包的 Ioskeley Mono Web 字体；中文使用系统 CJK 字体回退，不依赖网络字体服务。
- 默认使用白色简约的创作工具界面，以白色、浅灰和炭灰构成面板、画布与常规控件，不使用蓝色作为界面主题色；应用设置提供“外观”标签页，可在浅色模式和黑夜模式之间手动切换，选择持久保存到本机并在应用启动时恢复，黑夜模式对侧栏、顶部栏、画布、节点、菜单、弹窗和属性面板统一生效。两种模式的交互状态均使用少量语义色区分，当前项目标识点为明绿色、节点选中边框及阴影为橙色、节点连接与缩放控制点为淡蓝色。左侧边栏跨越窗口全高，最上方保留与顶部栏等高的窗口拖拽及 macOS 系统按钮安全区，品牌 Logo 和产品描述位于安全区下方、“项目”导航上方，中部展示项目列表，底部固定应用设置入口，并支持在完整栏与图标窄轨之间收起/展开；节点创建集中在画布顶部工具栏，中部为画布，紧凑顶部栏展示项目与运行状态。画布左下导航控制组提供小地图显示/隐藏按钮；小地图默认显示，能够按节点实际画布尺寸绘制提示词、图片、视频和分组的缩略矩形，并在两种主题下保持可辨识的填充、描边和视口遮罩。属性面板不参与画布宽度布局，只在选中节点时以右侧浮层显示，高度约为可用视口的 90%，可从标题区域拖动且不会移出画布可视范围，删除节点入口位于面板标题栏右侧。
- 节点单击即选中并同步显示右侧属性，多选使用 Shift；双击不作为选中的前置动作。
- 图片与视频节点在拥有可用素材时提供 Lucide 全屏查看入口，不占用卡片单击选中动作。所有节点共用一个通过 Portal 挂载的全局媒体查看弹窗：图片等比例完整显示，视频提供原生播放控件，视频节点中的非视频预览素材按图片显示。弹窗后方使用覆盖全视口的深色模糊遮罩，支持 Esc、点击遮罩和右上角关闭按钮退出，并保留可访问的标题与按钮语义。
- 画布节点采用紧凑卡片与类型图标形态：标题与类型图标位于卡片上方，卡片主体只保留占位图标或必要的媒体结果预览；提示词摘要、空状态说明、等待文案及重复的底部描述不在节点内显示，运行状态使用图标反馈。卡片不显示传统连接端点；卡片左右侧中线外部均提供不可见的连接感应区，无需先进入卡片本体，指针进入即可显示圆形“+”按钮。感应区在 24px 按钮本体之外额外提供按钮尺寸 150% 的容错面积，按钮在感应范围内随指针沿卡片侧边移动，指针从卡片或外部感应区移向按钮时不得闪烁或消失。短按“+”打开与当前节点类型兼容的节点菜单，选择后自动创建并连接新节点；按住或拖动“+”显示临时曲线，释放到另一节点时直接建立有向关联，释放到空白处时打开同一节点菜单。连接方向优先由节点类型决定：提示词流向图片/视频、图片流向视频；只有图片→图片、视频→视频等同类型组合才使用起始侧决定方向，因此节点的空间位置不会阻止合法连接。图片连接视频时，第一条图片输入自动绑定为首帧，第二条自动绑定为尾帧，之后的图片按参考图排序。点击画布或按 Esc 可取消菜单及进行中的连接。持久连线使用无折角贝塞尔曲线。
- 全局导航快捷键包括 `Shift + Tab` 收起/展开左侧栏，以及在非文字输入状态下按空格键适配画布视口；应用设置提供“快捷键”标签页，统一展示导航与编辑快捷键。画布顶部工具栏不提供自动布局入口。
- 色彩、间距和焦点态通过 CSS variables 统一；键盘操作有可见焦点。
- 空项目不显示居中的创建引导；用户通过顶部工具栏或画布空白处右键菜单创建节点（详见 `0002-canvas-context-menu.md`）。

## 9. 验收

自动门禁：`pnpm typecheck`、`pnpm test`、`pnpm build` 全部通过。

功能验收：

1. 创建/切换/重命名/删除项目，重启后数据仍在。
2. 创建四类节点并完成画布编辑、连接、撤销/重做和布局。
3. 导入图片后通过自定义协议展示，重启仍可见。
4. Mock 文生图、图生图、图生视频均可运行；运行状态与结果落库。
5. OpenAI 凭据不出 Main；可配置、测试、删除，并能发起真实图片生成。
6. 图中不存在密钥、base64、Blob URL 或绝对路径。
7. 应用可生成 macOS/Windows 未签名安装包配置；正式签名、公证和真实厂商账单 smoke 属于发行阶段外部验收。

## 10. 非目标与后续

本轮不承诺平台账号、云同步、协作、Web/Docker 部署、音频/音乐、自动更新源、代码签名/公证、旧 Vue 数据自动迁移和 11 家 Provider 全量适配。上述能力只能在不破坏当前边界的前提下按独立里程碑加入。
