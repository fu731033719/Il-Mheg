# Il Mheg Canvas 实现设计

状态：已实现并验证  
日期：2026-09-26

本文只记录当前仓库已落地的技术事实。产品边界与验收目标见 `doc/spec/0001-local-ai-canvas-mvp.md`。

## 1. 运行结构

应用由 Electron Main、Preload、React Renderer 三层组成：

- Main 创建数据库、素材仓库、凭据仓库和任务编排器，并注册白名单 IPC 与 `canvas-asset` 协议。
- Preload 通过 `contextBridge` 暴露 `CanvasDesktopApi`；事件订阅会返回取消订阅函数。
- Renderer 只消费公共 DTO，不导入 Electron、SQLite、文件系统或凭据实现。

`BrowserWindow` 已启用 `contextIsolation`、`sandbox`、`webSecurity`，关闭 `nodeIntegration`；新窗口、外部导航和权限请求默认拒绝。所有 IPC 输入和输出均由 `packages/contracts` 中的 Zod schema 校验，并检查调用来源是否为当前主窗口。自定义模型通过 `modelConfigurations.list/save/remove/test` 独立白名单 API 暴露，Renderer 仍无法读取密钥明文。

## 2. 模块职责

| 模块 | 已实现职责 |
| --- | --- |
| `apps/desktop` | Electron 生命周期、窗口安全策略、IPC、文件选择器、素材协议、Provider 凭据设置 |
| `apps/renderer` | 三栏无限画布 UI、状态管理、节点/连线交互、属性面板、运行反馈 |
| `packages/contracts` | 图、项目、素材、运行状态、模型目录和 IPC 的公共类型及运行时校验 |
| `packages/domain` | 节点创建、binding 推断、环检测、槽位去重、自动布局、复制和删除 |
| `packages/model-catalog` | Mock、OpenAI、DashScope 的 Provider/Model/Endpoint/参数 manifest |
| `packages/graph-compiler` | 合并提示词、解析显式素材槽位、校验模型能力并生成标准输入快照 |
| `packages/provider-adapters` | Mock 同步/异步结果、OpenAI Images JSON/multipart、DashScope 异步提交/轮询 |
| `packages/persistence` | SQLite migration、事务、CAS 图保存、运行状态转换和结果提交 |
| `packages/credential-vault` | `safeStorage` 加解密及仅状态可见的凭据访问边界 |
| `packages/asset-store` | 导入校验、哈希、分片路径、原子落盘、安全远程下载和公共素材 URL |
| `packages/runtime` | Run 创建、执行、轮询、取消、重试、恢复、结果物化和事件发布 |

## 3. 画布与状态

画布使用 `@xyflow/react`。节点持久化为 `prompt`、`image`、`video`、`group` 四种判别联合；执行连线持久化为 `prompt`、`source_image`、`first_frame`、`last_frame`、`reference_image` 或 `source_video` binding。

领域层在连线时阻止自连、环、非法节点组合和重复输入槽位，并在删除后重新规范连续索引。分组不参与执行图。自动布局基于有向无环图层级安排节点。

Renderer 使用 Zustand 保存当前项目、图、模型目录、公开素材、运行记录、选择态和最多 100 步历史。用户编辑进入撤销栈并在 450ms 后保存；运行事件不进入撤销栈。项目切换前会先刷新待保存内容。

React Flow 挂载节点时产生的普通尺寸测量只保留在其内部状态，不回写持久图；只有位置变化和用户主动调整的分组尺寸会进入图状态。重复选择、重复位置和重复 viewport 事件会在 Zustand 写入前被忽略，避免受控画布形成更新回路。

图保存使用 `AsyncGate` 串行化。旧实现在“无待保存变更”时会先同步执行 `finally`、后赋值一个已完成 Promise，导致新项目的后续保存永久复用该 Promise。现在任务经微任务启动后再持有门闩，同步空刷新、异步成功和失败都会释放；保存异常在显示通知后继续向调用方抛出，因此 `startRun` 只在节点已成功写入 SQLite 后调用 `runs.start`。

## 4. 持久化与素材

SQLite 使用 `node:sqlite`，启用 foreign keys、WAL、`synchronous=NORMAL` 和 5 秒 busy timeout。schema 版本当前为 3，包含以下表：

- `projects`
- `graphs`
- `runs`
- `assets`
- `provider_settings`
- `encrypted_credentials`
- `model_configurations`

`model_configurations` 保存模型 UUID、显示名称、上游模型名称、HTTP(S) Endpoint、模型类型、视觉生成用途（图片/视频）、视频输入模式、厂商和时间戳；凭据以 `custom-model:<modelId>` 为密钥单独写入 `encrypted_credentials`。编辑配置保留原 UUID，删除配置同时删除对应加密凭据。版本 3 migration 通过 `PRAGMA table_info` 检查并补齐 `visual_kind`、`video_mode`；旧视觉配置仅在模型名称或 Endpoint 明确包含 `video`、`t2v`、`i2v`、`r2v` 时迁移为视频用途，并分别推断文生、首尾帧或参考模式，其余旧配置保持图片用途。迁移可重复执行，重启不会覆盖已存选择。

图保存以 `baseRevision` 作为 CAS 条件；旧 revision 更新不会覆盖新图。运行成功时，运行记录、节点输出和图 revision 在同一事务中提交。

素材只在数据库记录相对路径。文件先写入 `assets/tmp/*.part`，再原子移动到按类型和 UUID 分片的目录。Renderer 仅得到 `canvas-asset://asset/<id>` URL。远程结果只允许 HTTPS，下载前解析主机并拒绝回环、私网和本地域名，同时限制图片为 50 MB、视频为 1 GB。

## 5. 任务执行

执行状态为：

```text
QUEUED → PREPARING → SUBMITTING
                    ├─ 同步结果 → DOWNLOADING → SUCCEEDED
                    └─ 异步任务 → WAITING_REMOTE → DOWNLOADING → SUCCEEDED
```

失败、取消和恢复还会使用 `FAILED`、`CANCEL_REQUESTED`、`CANCELLED`、`CANCELLED_LOCAL_ONLY` 与 `INTERRUPTED`。异步任务由主进程定时器轮询。重试会创建新 Run 并记录 `retryOfRunId`；取消后的迟到结果在本地提交前再次检查状态，不会写回画布。

应用重启时：排队任务重新执行；等待远程任务继续轮询；准备、下载中断转为可重试失败；提交阶段中断标记为 `INTERRUPTED`，避免无提示的重复计费。

## 6. Provider 实现

- Mock 图片：同步产生确定性的本地 SVG 作品；提示词含 `[fail]` 时可验证失败处理。
- Mock 视频：模拟异步提交和多次轮询，最终产生可在视频节点展示的动态 SVG 预览。
- OpenAI：`gpt-image-2` 文生图使用 JSON，请求图片编辑时使用 multipart 并保持输入图顺序；base64 和 HTTPS URL 结果都转成本地素材。
- DashScope：Wan 2.7 图生视频使用异步提交、任务状态轮询和远程 MP4 本地化，目录包含首帧/首尾帧与多参考图模型。
- 自定义视觉/多模态图片模型：完整 Endpoint 拆分为 origin 和请求 path，图片节点复用 OpenAI Images 兼容适配器；以 `/v1` 结尾的 Base URL 自动补全 `/images/generations`，`/edits` 路径生成 multipart 图生图请求。阿里云 Model Studio MaaS 的 `/compatible-mode/v1` 使用 `/images/generations` JSON 接口，图生图文件转 Data URL 写入顶层 `image` 数组，并省略该接口不支持的 `quality` 和 `output_format`。有密钥时注入 Bearer 凭据，无密钥时允许连接本地或免鉴权 Endpoint。
- 自定义视觉视频模型：目录将其精确标记为 `kind=video` 和 `compatibleNodeKinds=['video']`，并按所选通用、文生视频、首帧/首尾帧或参考生视频模式生成能力约束。阿里云 MaaS `/compatible-mode/v1` Base URL 会转换为同一工作空间的 `/api/v1/services/aigc/video-generation/video-synthesis`，复用 DashScope 异步 adapter 提交并从 `/api/v1/tasks/{taskId}` 恢复轮询。提交携带异步请求头、模型名、提示词、有序媒体 binding 以及分辨率、比例、时长、智能扩写和水印参数；内部 `reference` 角色在 adapter 边界转换成 Provider 的 `reference_image`。参数 manifest 根据上游模型名区分：Wan 2.7 使用 `720P/1080P` 和五种固定比例，Wan 3.0 使用 `480P/720P/1080P` 并保留 `adaptive`、`21:9` 等七种比例。编译器会把旧图快照中当前模型已不接受的 select 值归一为对应字段默认值。

模型编译现接受显式 resolver。内置 resolver 从静态 manifest 读取，运行时 resolver 优先用节点的 `modelId` 查找 SQLite 自定义配置，因此节点选择、编译与执行共用同一个稳定 ID。视频编译支持零素材文生视频，并为参考模式把连接图片规范化为有序 `reference_image` binding；首帧与尾帧继续保留显式顺序。新运行将完整的脱密模型/Endpoint 快照存入内部 Run 快照，以支持应用恢复；该快照不含凭据，且继续在 IPC 公开返回前被剥离。

真实 Provider 的 API Key 只在 Main 中短时解密并加入请求头。公开 Provider 状态只包含是否配置、加密后端、安全标记和最近连接测试结果。

任务查询、创建、取消、重试及运行事件在离开 Main 前统一映射为 `PublicRunRecord`；输入快照与远程任务 ID 等内部恢复字段不会通过 IPC 暴露给 Renderer。

## 7. UI 实现

设置的“模型配置”标签页由独立 `ModelConfigurationPanel` 承载，支持自定义模型的新增、编辑、删除和 Endpoint 可达性测试。可配置显示名称、上游模型名称、Endpoint、LLM 厂商、API Key 与四种模型类型；视觉模型额外配置图片/视频生成用途，视频用途额外配置通用、文生、首尾帧或参考输入模式。目录通过 `compatibleNodeKinds` 显式描述节点兼容关系：大语言模型→提示词，视觉模型按生成用途精确映射图片或视频，多模态模型→提示词/图片，语音模型在当前无语音节点时不出现在节点下拉中。内置非 Mock 模型也只在对应 Provider 凭据配置后进入节点目录。

节点属性面板使用 `compatibleNodeKinds` 与目录中的真实模型 ID。提示词节点也可保存大语言/多模态模型选择。若图中的 `modelId` 已不在当前目录，面板显示配置失效警告而不自动选择其他模型。

界面为白色简约三栏工作区：白色顶部栏与两侧面板、浅灰点阵无限画布、炭灰主操作与轻量中性阴影，不使用蓝色作为界面主题色。交互状态通过局部语义色区分：当前项目标识点使用明绿色；普通节点和分组节点的选中边框、外发光阴影使用橙色；节点输入/输出端点以及分组缩放手柄使用淡蓝色，分组缩放参考线使用橙色；连线和 MiniMap 继续使用灰阶。左侧边栏跨越窗口全高，顶部先保留 44px 拖拽安全区并以底部分隔线与顶部栏对齐，使 macOS 红黄绿窗口按钮不与内容重叠；品牌 Logo 和产品描述位于该安全区下方、“项目”导航上方，底部固定应用设置。边栏可从 232px 完整模式收起为 64px 图标窄轨，收起后仍可新建/切换项目、打开设置，并通过悬浮提示显示名称；收起/展开按钮随品牌区下移。顶部栏高度由 56px 缩减为 44px，只保留项目名称和保存状态。节点创建统一由画布顶部工具栏提供，MiniMap 位于画布左下角并与缩放/适配视图控制组成导航区；导航区新增 Lucide `Map` 开关按钮，默认显示小地图，按钮通过 `aria-pressed` 和动态标签暴露当前状态。属性面板不再作为固定布局列挤压画布，只在选中节点时显示为画布右侧的 340px 浮层，高度为画布可用区域的 90%；标题区域是拖拽手柄，指针捕获期间根据画布边界约束位置，确保面板不会被拖出可见区域；标题栏右侧提供红色 Lucide 垃圾桶按钮，内容底部不再重复显示删除按钮。原左侧“创作节点”重复入口与“本地优先”信息卡均已移除。节点通过单击直接选中并同步右侧属性，Shift 单击用于多选。已实现的 shadcn 风格组件包括 Button、Input、Textarea、Select、Dialog、Badge、Tabs、Tooltip 和 Separator。

主题由 `ThemeProvider` 集中管理，设置弹窗的“外观”标签页提供浅色与黑夜两种手动选项，并将选择写入 Renderer 的 `localStorage` 键 `il-mheg:theme`。`public/theme-init.js` 在 React 入口脚本前读取该键并设置根元素的 `dark` 类、`data-theme` 与 `color-scheme`，避免应用启动时出现浅色闪烁；Provider 在运行期同步切换并为组件提供当前状态。浅色与黑夜模式共用 shadcn 语义颜色变量，画布背景、点阵、边线、MiniMap、选择框与运行高光使用独立主题变量；节点卡片、连接菜单、属性面板、设置弹窗和品牌 Logo 通过语义类或 `dark` 变体保持对比度。未保存过主题时始终使用浅色模式，不自动跟随系统主题。

Renderer 的快捷键定义与设置页说明集中在 `lib/keyboard-shortcuts.ts`。侧栏监听 `Shift + Tab` 并切换 232px/64px 状态；画布在 React Flow 实例就绪后监听空格键并执行带动画的 `fitView`。文字输入目标会跳过全局快捷键，空格键同时避开按钮、链接、标签页等交互控件，以保留原生键盘激活行为。设置弹窗包含“快捷键”标签页，展示导航和编辑操作；顶部画布工具栏已移除自动布局按钮，领域层布局算法仍保留供内部能力复用。

普通节点宽度统一为 224px，并采用卡片外标题、Lucide 类型图标和纯预览主体结构。提示词节点使用 224×108 的紧凑图标卡片；图片节点使用 224×260 的方形主体卡片；视频节点使用 224×162 的 16:9 主体卡片；分组使用持久化尺寸或 560×360 回退值。上述尺寸由 `lib/flow-node-layout.ts` 统一提供，同时显式写入受控 React Flow Node 的 `width` 与 `height`，使 MiniMap 不依赖仅存在于 React Flow 内部的 DOM 测量值即可生成缩略矩形；分组包围盒也复用同一尺寸源。MiniMap 按节点类型使用主题化灰阶填充、非缩放描边和视口遮罩，选中节点使用橙色描边。空状态由单个淡灰类型图标表达，不渲染提示词摘要、等待说明、运动描述或动态预览徽标。运行记录在标题区以加载、成功、失败或停止图标呈现，完整参数和文本仍由右侧属性面板承载。

拥有素材的图片和视频节点会在卡片悬停时显示 Lucide `Expand` 按钮；该按钮使用 `nodrag nopan` 并阻止指针/点击事件冒泡，因此不会触发节点拖动、画布平移或父级选中。`CanvasWorkspace` 持有唯一的当前查看目标，`MediaViewerDialog` 通过 Radix/shadcn Dialog Portal 渲染在画布层级之外，不受 React Flow transform 或 overflow 影响。弹窗的遮罩覆盖全视口，使用深色半透明背景与 `backdrop-blur-xl`；图片以 `object-contain` 完整显示，真实视频 MIME 使用带原生 controls 的 `<video>`，视频节点中的 Mock SVG 等非视频素材自动回退为 `<img>`。Radix 统一提供 Esc、点击遮罩、焦点管理和关闭后焦点恢复，同时保留隐藏的语义标题和可见关闭按钮。通用 `DialogContent` 新增可选的遮罩、关闭按钮样式与显示开关，现有设置弹窗继续使用原默认行为。

节点关联由 Renderer 的边缘感知手势负责。传统 React Flow Handle 保留为 1px 透明、不可交互的持久曲线锚点，卡片上不显示端点圆点；卡片内部距可连接边缘 54px 的区域以及左右中线外部的圆形热区均可激活最近兼容方向的 Lucide `Plus` 按钮。外部热区为 60×60px，由 24px 按钮本体和额外 150% 按钮尺寸的容错面积组成，并与卡片边界重叠 2px，保证指针可连续移向按钮。按钮纵坐标根据 React Flow 当前缩放比例从屏幕坐标换算到节点本地坐标，因此在非 100% 缩放下仍沿卡片边缘跟随指针。短按按钮打开 `NodeCreationMenu`，按住 180ms 或移动至少 5px 后进入拖线状态；拖线由画布级 SVG 贝塞尔曲线渲染，命中带 `data-canvas-node-id` 的另一节点时突出目标，释放后直接调用领域层 `connectNodes`，释放到空白处则在落点打开同一菜单。菜单和拖放方向由 `lib/node-connections.ts` 按节点类型解析：提示词固定流向图片/视频，图片固定流向视频，同类型节点才由左右侧决定方向，因此合法连接不受节点空间位置影响。图片→视频的第一条边由领域层绑定为 `first_frame`，第二条绑定为 `last_frame`，后续图片绑定为有序 `reference_image`；编译器按首帧、尾帧、参考图顺序生成输入快照。Store 的 `addConnectedNode` 复用同一方向解析，并在一次提交中创建兼容节点和连线。点击画布或按 Esc 会关闭菜单并取消手势。持久边仍使用单一 `output`/`input` 锚点和 curvature 0.42 的贝塞尔曲线，不在画布线上重复显示 binding 文本；binding 详情保留在属性面板。

新建节点按每行三列、横向 320px、纵向 300px 的网格间距生成，保证默认 224px 卡片及其外侧连接按钮之间留有可读的曲线空间，不再沿小幅对角偏移叠放。

所有功能图标均从 `lucide-react` 导入。顶部品牌区和网页图标使用由用户原图轮廓化得到的 `public/brand/il-mheg-logo.svg`；该文件仅包含深色矢量路径，不含底色或嵌入位图。品牌 Logo 与 Provider 生成的 Mock SVG 均不属于功能图标。

Renderer 本地打包 Ioskeley Mono v2.1.0 的 Web 子集，以 Regular、Italic、Medium、SemiBold 四个 WOFF2 文件覆盖界面英文、数字和标点；中文由平台 CJK 字体栈回退。字体及随附授权文本位于 `src/assets/fonts/ioskeley-mono`，运行时不请求外部字体服务。

## 8. 已完成验证

- TypeScript 全仓严格类型检查。
- Vitest 领域、编译器、模型目录和 Provider adapter 单元测试。
- 自定义视频模型覆盖目录映射、Wan 2.7/3.0 参数差异、零素材文生视频、首尾帧与参考 binding、旧 select 值归一、`reference_image` Provider 映射和 DashScope 异步提交参数；SQLite 集成测试覆盖新字段保存编辑和版本 2 旧库迁移后重开。
- Vite Renderer 与 esbuild Main/Preload 生产构建。
- Electron Node 运行时 SQLite + Mock 文生图 + Mock 异步图生视频 smoke。
- 全局媒体查看器已通过全仓 TypeScript 检查与 Renderer 生产构建；Dialog Portal、图片/视频 MIME 分支、节点查看事件边界和遮罩样式均纳入构建产物。
- 1440 × 900 Renderer 视觉检查，确认三栏布局、空状态、工具栏和属性面板无重叠。
- Electron 主进程启动检查，确认 `canvas.db` 建表、schema version 与默认项目落库。
- Electron 开发窗口在缩放画布下完成节点外侧热区命中检查，确认无需先进入卡片本体即可显示连接按钮。
- `electron-builder --dir` 已生成 macOS ARM64 未签名应用目录。

未执行真实付费 Provider 调用，也未进行 Apple/Windows 代码签名、公证和发行渠道安装测试。
