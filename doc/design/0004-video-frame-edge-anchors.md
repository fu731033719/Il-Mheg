# 视频首尾帧连线锚点实现

## Renderer 连线映射

`apps/renderer/src/lib/node-connections.ts` 集中定义持久边的目标锚点 ID，并将 `first_frame` 映射到左侧首帧锚点、`last_frame` 映射到右侧尾帧锚点；其他 binding 继续映射到通用输入锚点。该映射是由持久化 binding 派生的展示数据，不写回图结构。

`apps/renderer/src/components/canvas-workspace.tsx` 在把领域边转换为 React Flow 边时调用该映射，因此已有项目加载后和新建连线保存后使用相同的锚点规则。

## 视频节点锚点

`apps/renderer/src/components/nodes/canvas-nodes.tsx` 为视频节点提供三个不可见目标锚点：左侧通用输入、左侧首帧输入和右侧尾帧输入。视频输出仍使用原有右侧输出锚点；其他节点仍只有原有通用输入与输出锚点。

## 验证

`apps/renderer/src/lib/node-connections.test.ts` 覆盖首帧、尾帧和参考图的目标锚点映射。全量 Vitest 测试、TypeScript 类型检查以及 Renderer/Desktop 生产构建均通过。
