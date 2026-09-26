# ILMhegAgent

ILMhegAgent 是一个纯本地的 AI 图片、视频创作桌面应用。它用无限画布组织提示词、图片和视频节点；项目图、运行记录、生成结果及模型凭据都由 Electron 主进程保存在本机。

## 已实现能力

- React 19、Electron、React Flow、Zustand 与 Tailwind/shadcn 风格组件。
- 平移、缩放、框选、多选、MiniMap、自动布局、分组、复制粘贴、撤销重做。
- `prompt`、`image`、`video`、`group` 四类节点，以及带明确语义的输入连线。
- 属性面板以缩略图展示输入引用，并支持点击快速切换到来源节点。
- 项目创建、切换、重命名、删除与 450ms 防抖保存。
- 本地图片导入和 `canvas-asset://` 素材访问。
- Mock 文生图、图生图、异步图生视频流程，无需 API Key 即可体验。
- OpenAI GPT Image 2 文生图/图片编辑，以及通义万相 Wan 2.7 图生视频适配器。
- SQLite 持久化、图 revision 冲突保护、任务取消/重试/恢复、结果本地化。
- API Key 使用 Electron `safeStorage` 加密，Renderer 只能查看是否已配置。
- 界面功能图标统一使用 `lucide-react`。

## 本地运行

环境要求：Node.js 24、pnpm 10。

```bash
pnpm install
pnpm dev
```

浏览器仅用于快速检查 Renderer：

```bash
pnpm dev:renderer
```

浏览器预览使用内存适配器，不代表桌面端 SQLite、凭据和文件能力；完整功能请运行 Electron。

## 使用方式

1. 从画布顶部工具栏添加提示词、图片或视频节点，也可在画布空白处右键直接创建。
2. 选择节点，在右侧填写提示词、选择模型并调整参数。
3. 从节点把手拖出连线，绑定提示词、源图片、首帧、尾帧或参考图片。
4. 选择图片/视频节点并点击“开始生成”。默认 Mock 模型完全离线可用。
5. 如需真实模型，在右上角“应用设置 → 模型服务”中保存并测试 API Key。

应用数据写入 Electron 的 `userData` 目录，其中包含 `canvas.db` 和 `assets/`。远程生成结果下载完成后会转为本地素材。

## 验证与打包

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm test:runtime
pnpm verify
pnpm dist
```

`pnpm test:runtime` 会在 Electron 自带的 Node 运行时中，用临时目录验证真实 SQLite、Mock 文生图和异步图生视频链路。`pnpm dist` 生成未签名的 macOS/Windows 安装产物；正式发布仍需平台证书、签名和公证。

## 工程结构

```text
apps/desktop           Electron Main、Preload、IPC
apps/renderer          React 无限画布与 shadcn 风格 UI
packages/contracts     Zod IPC 契约与公共 DTO
packages/domain        图模型、不变量和编辑命令
packages/model-catalog Provider/Model/Endpoint manifest
packages/graph-compiler 持久图到标准生成输入的编译
packages/provider-adapters Mock、OpenAI、DashScope 适配器
packages/persistence   node:sqlite 仓储与迁移
packages/credential-vault safeStorage 凭据封装
packages/asset-store   本地素材导入、下载与寻址
packages/runtime       任务编排、轮询、取消与恢复
```

确认的技术规格见 `doc/spec/`，实现事实见 `doc/design/`。
