# 桌面应用图标圆角与阴影实现

## 视觉构成

`build/icon.png` 为 1024×1024 RGBA PNG。白色卡片在画布内四周缩进 72 像素，尺寸为 880×880 像素，圆角半径为 190 像素；卡片带有轻微描边以及向下偏移的半透明柔和阴影。

Il Mheg LOGO 继续取自 `apps/renderer/public/brand/il-mheg-logo.svg`，按原始比例缩放到 670 像素高并在卡片中居中。LOGO、卡片和阴影之外的画布保持透明。

Renderer 品牌区与 favicon 继续直接使用原透明 SVG，不应用桌面图标的圆角卡片样式。

## 打包

Electron 主进程、macOS 与 Windows Builder 配置仍统一引用 `build/icon.png`。macOS Builder 从该资源生成包含标准尺寸层级的 `icon.icns`，并通过 `extraResources` 将同一 PNG 写入应用包供运行时 Dock 与窗口图标使用。

## 验证

- 源图标四角及最外圈像素完全透明，中心卡片完全不透明，卡片外阴影区域为半透明。
- 阴影在画布最外圈前衰减为完全透明，没有发生边缘裁切。
- TypeScript 类型检查通过。
- Vitest 共发现 62 项测试，60 项通过、2 项按既有配置跳过。
- Renderer 与 Desktop 生产构建及 Electron 运行时冒烟测试通过。
- Electron Builder 成功生成 macOS 目录包；从 `icon.icns` 解出的 1024×1024 图层保留了圆角透明区与阴影，包内运行时 PNG 与源文件校验值一致。
