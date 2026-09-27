# 百炼北京地域高质量图像与视频模型

## 范围

用户要求配置百炼中质量优先的图像和视频模型，并确认使用华北 2（北京）。复用现有 `dashscope` Provider 和本机加密凭据，不读取或复制明文密钥。

- 图像：`qwen-image-3.0-pro`、`wan2.7-image-pro`。
- 视频：`wan3.0-video`、能力对齐的高速版 `wan3.0-video-prime`。
- 保留现有 Wan 2.7 模型及节点引用，不替换用户已有节点的模型。
- 图片使用 DashScope 同步多模态协议；视频使用已有异步协议与轮询。
- 图片输入、输出数量和尺寸按各模型声明限制；Wan 2.7 Pro 的 4K 仅在文生图端点提供，图片编辑最高 2K。
- 视频仅接入当前画布能表达的文生视频、首帧、首尾帧及图片参考；不宣称已接入音频、视频、文档输入。
- Wan 3.0 默认 1080P、5 秒、原生声音开启；图像默认单张输出。

## 已核对接口

核对日期：2026-09-27。北京通用域名 `https://dashscope.aliyuncs.com` 继续有效；官方推荐的 Workspace 专属域名需要业务空间 ID，本次沿用已配置 Provider 的通用域名。

- [图像选型](https://help.aliyun.com/zh/model-studio/text-to-image)
- [Qwen Image 3.0](https://help.aliyun.com/zh/model-studio/qwen-image-generation-and-editing-api-reference)
- [Wan Image 2.7](https://help.aliyun.com/zh/model-studio/wan-image-generation-and-editing-api-reference)
- [Wan 3.0](https://help.aliyun.com/zh/model-studio/wan3-video-generation-api-reference)

## 验证

使用模拟 HTTP 响应验证请求字段、原始图片结果解析、错误处理、视频音频开关与任务轮询；验证图编译的输入和尺寸限制。运行项目 verify，重启桌面应用检查模型列表及既有凭据状态。配置任务不自动提交付费生成，账号对具体模型的授权及真实出图效果留待实际调用确认。
