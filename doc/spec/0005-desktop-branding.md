# 桌面端名称与应用图标

## 目标

桌面应用统一使用 `ILMhegAgent` 作为面向用户的名称，并复用项目现有 Il Mheg LOGO 作为桌面应用图标。

## 行为

- Electron 运行时、应用窗口页面和安装包显示名称统一为 `ILMhegAgent`。
- macOS 应用包、DMG/ZIP 与 Windows NSIS 安装包使用由 `apps/renderer/public/brand/il-mheg-logo.svg` 派生的应用图标。
- 开发模式窗口在支持窗口图标的平台上使用同一派生图标。
- Renderer 现有品牌区与 favicon 继续直接使用同一 SVG LOGO，不引入第二套品牌图形。

## 验收

- Electron Builder 配置的产品名为 `ILMhegAgent`。
- Renderer 文档标题为 `ILMhegAgent`。
- 桌面主进程显式设置应用名，并为窗口配置 LOGO 派生图标。
- macOS 与 Windows 打包配置均引用存在且可解析的图标资源。
- TypeScript 类型检查、自动化测试和生产构建通过。
