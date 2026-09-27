# 可配置节点引用源实现

## 领域层

`packages/domain/src/index.ts` 以 `InputBindingKind` 统一描述现有提示词、源图片、首帧、尾帧、参考图和源视频用途。`bindingKindsForConnection` 根据来源与目标节点类型返回合法用途，Renderer 与领域更新共用这一规则。

`updateEdgeBinding` 是调整引用用途的唯一写入口。它校验边和两端节点、拒绝不兼容用途，并在首帧或尾帧已占用时交换原有唯一用途；从参考图切换到已占用用途时，被替换的来源回退为参考图。更新完成后，所有带索引的 binding 通过原有 `normalizeBindingIndices` 连续归一，再由 `validateGraph` 验证图结构。

已有建边与编译格式未迁移：新建图片到视频的连线仍依次推断为首帧、尾帧、参考图，Graph Compiler 和 Provider adapter 继续消费原有显式 binding。

## Renderer

`apps/renderer/src/store/canvas-store.ts` 暴露 `setEdgeBinding`，并通过通用 `commit` 流程调用领域更新，因此用途修改自动进入撤销/重做历史与延迟保存队列。

`apps/renderer/src/components/inspector.tsx` 将原“输入素材”统一命名为“引用源”。每个引用卡片保留预览、当前用途、来源名称和来源节点导航；存在多个合法用途时，在同一卡片内显示独立用途选择器。图片到视频可选择首帧、尾帧或参考图，提示词、图片到图片和视频到视频等唯一语义保持只读展示。选择器与导航按钮为并列交互元素，修改用途不会误触来源节点导航。

画布边的目标锚点继续从当前 binding 实时派生，因此切换首帧、尾帧或参考图后无需额外同步展示状态。

## 验证

- 领域测试覆盖图片到视频的完整可选用途、参考图改为已占用首帧、首尾帧互换、索引归一和非法用途拒绝。
- Store 测试确认用途调整写入图数据和撤销历史。
- 全量 73 项测试通过，另有 2 项按既有条件跳过。
- TypeScript 类型检查、Renderer/Desktop 生产构建和 Electron 运行时 smoke test 通过。
- 浏览器预览中实际建立图片到视频连接，属性面板显示首帧/尾帧/参考图选择器；切换为参考图后标签与选择值立即更新，控制台无警告或错误。

