# 国内视频制作工作流与首批 API 选择

调研依据：参考产品官网及官方产品文档，再向模型供应商核对 API。这里记录产品实际展示和接入建议，不把某个平台展示的模型解释为国内市场占有率排名。

## 官网展示的工作流

参考产品的公开说明覆盖脚本/分镜、角色和产品参考图、图片生成与编辑、图生视频、首尾帧、参考视频，以及剪辑、续写和重拍。这意味着平台接入需要同时覆盖文字、图片和视频，不能仅集成一个视频生成接口。

图片编辑当前列出 GPT Image 2、Banana Pro 和 Seedream 5.0 Pro。视频文档列出 Seedance 2.5、MiniMax H3/H3 Max、Wan 3.0 和 FLUX 3；不同账号开放范围可能不同。

## 首批选择

| 优先级 | 家族与国内接入渠道 | 用途 | 本次确认结果与处理 |
| --- | --- | --- | --- |
| 第一批 | MiniMax H3 / H3 Max，中国站官方 API | 文生视频、首帧/首尾帧 | 创建、查询、输出用量和中国站价格均已核对；实现专用适配器和四个规格预设 |
| 第一批 | Wan，阿里云百炼 | 国内图生视频替代渠道 | 公开文档可核对 Wan 2.7 API；实现首帧预设，不将参考产品的 Wan 3.0 展示名直接当作公开 API ID |
| 第一批 | Seedream，火山方舟 | 产品图、角色设定、分镜图和图片编辑 | 在系统 Chrome 读取官方文档，核实 5.0 Pro 模型 ID 与生图协议，已加入单图/多参考图生图预设；价格待配置 |
| 第一批 | Seedance，火山方舟 | 视频主力、首尾帧 | 在系统 Chrome 核实官方 2.5 模型 ID、创建与查询协议，已加入文生视频/首尾帧预设；实际账号权限及价格仍需配置 |
| 按需求扩展 | GPT Image / Banana、可灵、Vidu 等 | 风格补充、特殊镜头或跨境模型 | 本次未完成其国内公开渠道、计量字段和价格的完整核对，不预先开放 |

火山当前示例的模型 ID 为 `doubao-seedream-5-0-pro-260628` 和 `doubao-seedance-2-5-260628`。图片走 `/api/v3/images/generations`；视频走 `/api/v3/contents/generations/tasks`，查询响应含 Token 用量及实际视频时长。Seedance 文档中的折扣“约每秒”不是统一计价规则，预设不据此自动生成单价。[Seedream API](https://docs.volcengine.com/docs/82379/1541523?lang=zh)、[Seedance 创建](https://docs.volcengine.com/docs/82379/1520757?lang=zh)、[Seedance 查询](https://docs.volcengine.com/docs/82379/1521309?lang=zh)

以上是围绕本项目功能的接入优先级判断。文字模型先复用标准 Chat Completions 适配；正式型号需同时满足中文脚本能力、实际账号可用性和完整用量返回。

MiniMax 当前中国站创建接口是 `POST https://api.minimax.cn/v2/video_generation`，查询接口是 `GET /v2/query/video_generation/{task_id}`。返回的 `task.usage.output_seconds` 用于输出计量；输入视频、超额参考图片另有费用。当前适配明确限制为最多两张首尾帧图片，避免遗漏多模态输入费用。[创建接口](https://platform.minimaxi.com/docs/api-reference/video-generation-v2-create)、[查询接口](https://platform.minimaxi.com/docs/api-reference/video-generation-v2-query)

阿里云公开文档推荐使用业务空间专属域名，旧北京域名仍可用。Wan 2.7 采用异步提交与查询，计量响应包括输入和输出视频时长；当前预设只开放首帧图片，按 `usage.output_video_duration` 取实际输出秒数。[Wan 2.7 API](https://help.aliyun.com/en/model-studio/image-to-video-general-api-reference)

## 价格处理

MiniMax 中国站公开参考价：H3 768P 为 ¥0.50/秒、2K 为 ¥0.80/秒；H3 Max 480P 为 ¥0.33/秒、768P 为 ¥0.50/秒。H3 的前五张输入图片免费，更多图片和输入视频另计。[官方按量价格](https://platform.minimaxi.com/docs/guides/pricing-paygo)

预设导入仅建立未发布价格草稿和未开放模型。平台加价暂以 **20% 建议值**填入草稿，便于预览；需要根据采购折扣、失败率、重试和运营成本调整。成本草稿使用公开刊例价作为核算起点，不表示实际合同价格已确认。未核实的价格保持缺失，不能用 0 填充。

模型及价格在管理界面分别发布/开放后才出现在用户模型列表。渠道凭据仍需配置到服务端环境变量。本次调研和模拟验证没有证明任何真实账号已经具备相应模型权限，也没有产生供应商调用费用。

