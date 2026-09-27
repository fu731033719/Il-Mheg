# 百炼 MiniMax H3 接入

用户指定百炼北京 MiniMax H3 模型卡片。复用已有 `dashscope` Provider 的北京 Endpoint 和加密 API Key，新增稳定模型 ID `bailian-minimax-h3`，上游名称严格为 `MiniMax/MiniMax-H3`。保留 MiniMax 官方直连条目及既有节点。

- 支持当前画布的文本、首帧、首尾帧和最多九张参考图工作流；暂不新增尾帧单图、视频或音频输入工作流。
- 分开声明文本、帧控制、参考图端点：文本必须指定比例，帧控制使用 adaptive，参考图可选 adaptive。
- 默认 2K、5 秒；分辨率仅 768P/2K，时长 4–15 秒。
- 复用 DashScope 异步提交/轮询；参考图类型使用 `image_url`。
- 本地图片通过百炼上传策略上传至私有临时存储，使用 `oss://` URL 与 `X-DashScope-OssResourceResolve: enable`。只有用户实际发起带图片的生成任务才上传，不在配置或轮询时上传。
- 上传使用同一百炼模型与账号；保持图片顺序；限制格式与 30 MB 大小；不给 OSS 上传请求附带百炼 API Key。
- 校验请求参数、上传/取消/失败、轮询、编译输入限制，执行 verify 后重启桌面检查模型可见。
- 不在配置过程中开通外部模型服务或提交付费生成；服务授权与实际生成以用户账号调用为准。

核对来源（2026-09-27）：
- https://help.aliyun.com/zh/model-studio/minimax-video-generation-api-reference
- https://help.aliyun.com/zh/model-studio/get-temporary-file-url/
