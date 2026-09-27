# 画布导航交互实现设计

## CanvasWorkspace

`CanvasWorkspace` 将 React Flow 的空白区域拖动配置为鼠标左、中、右键均可平移画布。普通左键拖动不再直接启动框选；React Flow 的默认 Shift 选择键仍可在 Shift + 左键拖动时启动框选，因此节点多选能力保留。

画布启用 `panOnScroll`，使触摸板的像素级双指滚动直接按二维增量平移 viewport；同时关闭 React Flow 的普通滚轮缩放入口。`zoomOnPinch` 保持启用，Chromium 在 macOS 上带 `ctrlKey` 的触摸板捏合事件仍由 React Flow 处理。

设置页的导航快捷操作列表同步展示左键拖动、触摸板双指移动、滚轮和触摸板捏合的当前行为。

## useCanvasWheelNavigation

`useCanvasWheelNavigation` 在 React Flow Renderer 外层以 capture wheel listener 接收输入。只有判定为离散鼠标滚轮的事件会在进入 React Flow 前被拦截，并通过实例当前 viewport 计算下一 viewport；触摸板平移与捏合事件继续进入 React Flow 自身的平移/缩放管线。

滚轮缩放使用事件位置作为锚点，并复用画布的 `0.15`/`2.5` 缩放边界。`instance.setViewport` 触发既有 `onMoveEnd`，最终由 canvas store 的 `setViewport` 保存项目 viewport。

## canvas-navigation

`lib/canvas-navigation.ts` 独立负责两项纯计算：

- wheel 输入判定：`ctrlKey` 输入为捏合；非像素模式、传统 120 步长或大幅整数纵向输入为鼠标滚轮；其余像素级输入为触摸板平移。同一 180 ms 连续序列沿用首次判定，避免触摸板惯性阶段因增量变大而切换为缩放。
- 锚点缩放：根据当前 viewport、屏幕锚点和标准化 wheel delta 计算新平移量与缩放值，使锚点对应的画布坐标在缩放前后保持不变。

单元测试覆盖触摸板惯性序列、离散滚轮、macOS 捏合判定、锚点稳定性和缩放边界。
