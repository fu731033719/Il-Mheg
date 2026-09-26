# 桌面端名称与应用图标实现

## 产品名称

根 `package.json` 的顶层 `productName` 与 Electron Builder `build.productName` 均设置为 `ILMhegAgent`。顶层字段供 Electron 读取应用元数据，Builder 字段决定生成的应用包及安装产物名称。

`apps/desktop/src/main.ts` 通过 `app.setName` 显式设置运行时应用名，创建主窗口时同步设置窗口标题。`apps/renderer/index.html` 的文档标题以及 README 中的产品名也使用 `ILMhegAgent`。

## 图标资源

`build/icon.png` 是从 `apps/renderer/public/brand/il-mheg-logo.svg` 栅格化并等比居中到透明 1024×1024 画布得到的桌面图标。Renderer 品牌区与 favicon 仍直接引用原始 SVG，因此桌面端和界面内品牌图形来自同一个 LOGO。

Electron Builder 的 macOS 与 Windows 配置均显式引用 `build/icon.png`。Builder 在 macOS 产物中由它生成 `icon.icns`；原始 PNG 还通过 `extraResources` 复制为包内 `Resources/icon.png`，供 Electron 主进程设置窗口图标，并在 macOS 上设置 Dock 图标。开发模式直接读取仓库中的 `build/icon.png`。

## 验证

- TypeScript 类型检查通过。
- Vitest 共发现 49 项测试，47 项通过、2 项按既有配置跳过。
- Renderer 与 Desktop 生产构建通过。
- Electron 运行时冒烟测试通过。
- Electron Builder 成功生成 macOS 目录包；包内 `CFBundleName` 与 `CFBundleDisplayName` 均为 `ILMhegAgent`，`CFBundleIconFile` 为由 LOGO 生成的 `icon.icns`，运行时 `icon.png` 也已写入资源目录。
- Electron Builder 成功读取 Windows 图标配置并进入 Windows 目录包生成流程。
