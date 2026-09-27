# 桌面应用图标白色背景

> 本规格中的全画布白色背景已由 `0008-rounded-desktop-icon.md` 的圆角卡片方案替代。

## 目标

桌面应用图标在现有 Il Mheg LOGO 下增加纯白色背景，避免透明图标在深色桌面、Dock 或任务栏环境中缺少对比度。

## 行为

- `build/icon.png` 保持 1024×1024 尺寸。
- 图标画布使用不透明纯白色背景，前景继续使用现有 `il-mheg-logo.svg` 的黑色 LOGO。
- LOGO 的比例、居中位置和留白保持不变。
- Renderer 侧边栏和 favicon 继续使用透明 SVG，不受桌面图标背景调整影响。

## 验收

- `build/icon.png` 不包含透明通道或透明像素。
- 图标四角及 LOGO 镂空区域均显示白色。
- Electron Builder 能继续从该 PNG 生成 macOS 应用图标。
- 类型检查、自动化测试和生产构建通过。
