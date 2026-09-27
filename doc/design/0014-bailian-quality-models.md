# 百炼北京图像与视频模型接入

验证日期：2026-09-27。

## 模型目录

`packages/model-catalog/src/bailian.ts` 新增四个内置模型，均使用已有 `dashscope` Provider 和北京通用域名，不迁移数据库或复制密钥：

| 模型 | 当前画布支持 | 默认输出 |
| --- | --- | --- |
| Qwen Image 3.0 Pro | 文生图、最多 3 张图片编辑，单次最多 6 张输出 | 2048×2048、1 张、扩写与思考开启 |
| Wan 2.7 Image Pro | 文生图、最多 9 张图片编辑，单次最多 4 张输出 | 文生图 4096×4096；编辑 2K 并跟随输入比例；1 张 |
| Wan 3.0 | 文本、首帧、首尾帧、最多 10 张参考图生成视频 | 1080P、5 秒、声音开启 |
| Wan 3.0 Prime | 同上，官方定义为能力对齐标准版的高速版 | 同上 |

Wan 图片的生成与编辑使用不同端点声明，编辑选项不提供 4K。Wan 3.0 的参考图模式独立声明，复用编译器既有的参考角色归一化规则。旧 Wan 2.7 视频条目保留。

## 协议适配

`DashScopeImageAdapter` 发送同步请求至 `/api/v1/services/aigc/multimodal-generation/generation`，按输入顺序构建 `input.messages[].content`，将 `count` 映射为 `parameters.n`。仅发送当前端点声明的参数，不附带 OpenAI 图片参数或异步请求头。解析 `output.choices[].message.content[].image`，结果交由既有 AssetStore 下载和保存；缺少密钥、服务错误、空图片结果均返回失败。

`DashScopeVideoAdapter` 继续使用异步提交和 `/api/v1/tasks/{taskId}` 轮询，新增保留 `audio=false` 的原生音频开关。未配置 `audio` 的原有模型请求保持不变。

## 验证证据与边界

- `pnpm verify` 通过：类型检查、20 个测试文件 / 85 项测试、生产构建、Electron runtime smoke。
- 新增 10 项测试覆盖原生图片字段、6 张输出请求、参考图顺序、4K/2K 模式限制、缺失密钥/服务错误/空结果、Wan 3.0 两种型号的异步轮询及静音参数、图编译输入限制。
- 重启后的桌面设置显示百炼「已就绪」和 6 个模型；图片节点下拉列表显示两个新增图片模型。密钥仍由 keychain 加密后端管理。
- 本次通过桌面设置重新执行百炼连接测试，结果为「连接成功」。该检查仅验证 Provider 连接，不能替代具体模型的生成验证。
- 未提交付费生成请求；模拟协议测试和本地 smoke 不代表各模型的账号授权、额度、远端可用性或实际出图效果已经验证。
- 未新增音频、视频、文档、网页输入或组图/交互式框选编辑能力。

官方依据见 [规格文档](../spec/0014-bailian-quality-models.md)。
