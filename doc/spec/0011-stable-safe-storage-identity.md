# macOS 凭据加密身份兼容

## 背景

Electron 在 macOS 上使用“应用名 + `Safe Storage`”作为 Keychain 服务名。桌面端展示名称从内部标识 `il-mheg-canvas` 调整为 `ILMhegAgent` 后，旧数据库仍包含由 `il-mheg-canvas Safe Storage` 加密的 API Key，但新进程改用 `ILMhegAgent Safe Storage`，导致图片生成在提交请求前报错，无法解密已有密文。

## 目标

- 面向用户的应用、窗口和安装包名称继续显示为 `ILMhegAgent`。
- macOS `safeStorage` 的 Keychain 身份固定为已有内部标识 `il-mheg-canvas`，不再随展示名称变化。
- 已经由旧内部标识加密的 API Key 无需重新输入即可继续使用。
- 当密文确实损坏、来自其他系统账户或因签名变化而无法读取时，不向界面暴露 Electron 英文底层错误，而是提示用户重新保存对应凭据。

## 行为

- macOS 启动早期在 Electron 初始化 `safeStorage` 前使用 `il-mheg-canvas` 作为进程应用名。
- Electron 就绪、Keychain 服务身份完成初始化后，将运行时展示名恢复为 `ILMhegAgent`，再创建窗口。
- Windows 和 Linux 继续直接使用 `ILMhegAgent` 作为运行时应用名。
- 凭据解密异常统一转换为 `CREDENTIAL_UNREADABLE`，提示在“应用设置”中重新输入并保存对应凭据。
- Provider 请求本身的异常不得被错误归类为凭据解密异常。

## 验收

- 身份模块测试覆盖展示名、用户数据目录名和 macOS Keychain 兼容名三者的关系，以及各平台启动名称。
- 凭据库测试覆盖解密成功、解密失败的错误转换，以及回调异常不被重写。
- 运行时能够将 `CREDENTIAL_UNREADABLE` 作为公开错误返回。
- TypeScript 类型检查、自动化测试、生产构建和 Electron 运行时冒烟测试通过。
