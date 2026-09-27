# macOS 凭据加密身份兼容实现

## 根因

Electron 的 macOS `safeStorage` 在启动阶段根据应用名确定 Keychain 服务名。数据库中的 8 条自定义模型凭据均由原内部名 `il-mheg-canvas` 加密；应用改用展示名 `ILMhegAgent` 启动后，`safeStorage` 读取了另一项 Keychain 密钥，因此在 Provider 请求发出前解密失败。

只读运行时检查确认：以 `ILMhegAgent` 作为启动名称时 8 条凭据均无法解密；以 `il-mheg-canvas` 作为启动名称、Electron 就绪后再恢复展示名时 8 条凭据均可解密。检查只统计成功数量，没有输出或改写凭据内容。

## 桌面应用身份

`apps/desktop/src/app-identity.ts` 现在分别定义：

- `APP_DISPLAY_NAME`：面向用户的 `ILMhegAgent`；
- `USER_DATA_DIRECTORY_NAME`：稳定数据目录 `il-mheg-canvas`；
- `SAFE_STORAGE_KEYCHAIN_NAME`：稳定 Keychain 身份 `il-mheg-canvas`。

`resolveStartupApplicationName` 在 macOS 返回稳定 Keychain 身份，在 Windows 和 Linux 返回展示名。`apps/desktop/src/main.ts` 在 Electron 就绪前使用该启动名称，让 `safeStorage` 继续访问已有 Keychain 项；就绪后立即将运行时名称恢复为 `ILMhegAgent`，然后再设置 Dock 图标、初始化数据和创建窗口。

## 凭据错误边界

`packages/credential-vault` 将解密步骤与凭据使用回调分成两个错误边界。只有解密异常会转换为 `CREDENTIAL_UNREADABLE` 和重新保存凭据的中文提示；Provider 请求回调抛出的错误保持原样。

`packages/contracts` 将 `CREDENTIAL_UNREADABLE` 纳入公开运行错误代码。`packages/runtime` 识别该代码、移除内部错误前缀，并将其标记为不可直接重试，避免继续暴露 Electron 的底层英文异常。

## 验证

- macOS 当前数据库的 8 条已有凭据在兼容启动流程下全部通过只读解密检查。
- TypeScript 类型检查通过。
- Vitest 共发现 70 项测试，68 项通过、2 项按既有环境条件跳过。
- Renderer 与 Desktop 生产构建通过。
- Electron 运行时冒烟测试通过，图片和视频生成链路均完成。
