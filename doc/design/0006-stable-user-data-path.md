# 桌面端用户数据路径兼容实现

## 应用身份模块

`apps/desktop/src/app-identity.ts` 将面向用户的应用显示名与持久化目录标识分开定义：显示名为 `ILMhegAgent`，兼容目录标识固定为 `il-mheg-canvas`。`resolveUserDataPath` 只使用系统 `appData` 根目录和兼容标识计算数据路径，不依赖显示名。

`apps/desktop/src/app-identity.test.ts` 覆盖显示名与目录标识相互独立以及稳定路径拼接，防止后续品牌名称调整再次改变持久化位置。

## Electron 初始化顺序

`apps/desktop/src/main.ts` 在设置显示名、申请单实例锁、等待应用就绪以及初始化数据库之前，调用 `app.setPath('userData', ...)` 将用户数据目录固定为 `appData/il-mheg-canvas`。项目数据库、模型配置、加密凭据、素材和 Electron 会话数据因此继续从原目录读取。

新名称产生的 `ILMhegAgent` 数据目录不会被代码自动删除、覆盖或合并。

## 验证

- 原 `il-mheg-canvas/canvas.db` 通过 SQLite `quick_check` 完整性检查。
- 编译后的 Desktop 入口确认先设置稳定 `userData` 路径，再设置 `ILMhegAgent` 显示名。
- TypeScript 类型检查通过。
- Vitest 共发现 50 项测试，48 项通过、2 项按既有配置跳过。
- Renderer 与 Desktop 生产构建通过。
- Electron 运行时冒烟测试通过。
