# 模型采购建议（2026-09-10）

范围假设：覆盖脚本、分镜、图片生成与编辑、视频生成与编辑、配音、音乐和音效；数字人、专业增强和 3D 生成按业务需求追加。用户已确定文字主模型使用 DeepSeek V4 Flash；其余为采购建议，国内音频替代尚未最终选定。

工作流调研后的优先级修订：音乐、音效和独立配音按实际路线采购，不再将“成片需要声音”直接等同于“每项都必须购买独立生成 API”。先验证静帧预演、镜头选择、独立声音与字幕合成的交付链路；当前项目时间线仍仅接受视频素材。完整依据和建议见 [AI 视频工作流调研](../research/ai-video-workflow-research-2026-09-10.md)。

本轮重新核对参考产品官方功能文档、供应商公开 API 文档，以及本项目的模型预设和节点定义。火山文档通过系统 Chrome 读取。未登录采购控制台核验账户权限，未执行付费生成，未开通或充值。

## 建议采购组合

文字主渠道改为 DeepSeek，图片与视频主渠道使用火山方舟，音乐使用 Mureka。配音优先评估同属火山引擎的豆包语音 2.0，MiniMax Speech 2.8 为备选；音效独立选型。Google 仅作为 Nano Banana Pro 的可选渠道。推荐依据是功能覆盖、减少重复接入及现有项目适配情况，并非生成质量实测排名。

| 优先级 | 模型/接口 | 采购渠道 | 在项目中的职责 |
| --- | --- | --- | --- |
| 已确定 | DeepSeek V4 Flash（deepseek-v4-flash） | DeepSeek 官方 API | 对话、中文脚本、角色提取和分镜结构；不承担直接图片或视频输入 |
| 视觉方案待定 | DeepSeek V4 Flash Vision Exp（deepseek-v4-flash-vision-exp） | 同一 DeepSeek 渠道 | 可用于图片及抽帧分析；实验模型，不能视为原生视频与音频理解的等价替换 |
| 必需 | Seedream 5.0 Pro | 火山方舟 | 产品图、角色参考图、分镜图及交互图片编辑 |
| 必需 | Seedance 2.5 | 火山方舟 | 视频主力，以及多模态参考、视频编辑、延长的供应商能力基础 |
| 独立配音路线优先，供应商待定 | 优先豆包语音合成 2.0；备选 MiniMax Speech 2.8 | 火山引擎豆包语音 / MiniMax 中国站 | 准确旁白、固定角色声线及独立音轨；原生视频音轨/实录能满足时无需重复生成，声音复刻按需另开 |
| 按需，供应商待定 | 可灵文生音效为国产模型候选；ElevenLabs Sound Effects v2 保留对照 | 可灵 / ElevenLabs | 现有素材或原生视频声音不足时生成独立音效；可灵公开协议已核实，国内服务区域和账户权限仍需确认，不由 TTS 替代 |
| 按需 | Mureka 音乐模型，优先核对 V9.5 权限 | Mureka API Platform | 需要原创歌曲、纯音乐和配乐时采购；已有合适音乐可直接复用，精确 model ID 以账号为准 |
| 推荐补充 | Nano Banana Pro（gemini-3-pro-image） | 可选 Google API 渠道 | 4K、复杂图文排版、另一种图片生成与编辑选择；不必同时购买 GPT Image |
| 推荐补充 | Seedance 2.0 Mini | 同一火山方舟渠道 | 分镜动态草稿、低成本候选；需要成片或特殊能力时选择 2.5 |

DeepSeek 官方将普通 V4 Flash 与支持图片输入的 Vision Exp 分为不同模型。视频拆解可评估“按镜头抽帧、保留时间戳、必要时另做语音转写，再由视觉/文字模型分析”的实现方案；这不是原生视频理解，可能遗漏帧间动作、声音及细节，需独立验收。[DeepSeek 接入说明](https://api-docs.deepseek.com/zh-cn/guides/reasoning_model)、[视觉 API](https://api-docs.deepseek.com/zh-cn/guides/vision/)

Nano Banana Pro 仍是独立的可选图片生成模型，文字主模型变更不自动取消它。[Nano Banana Pro](https://ai.google.dev/gemini-api/docs/models/gemini-3-pro-image)

参考产品图片编辑入口提供 GPT Image 2、Banana Pro、Seedream 5.0 Pro。这里选 Seedream 为主、Banana 为补充，是本项目采购取舍，不意味着参考产品只使用这些模型。

火山当前图片文档确认 Seedream 5.0 Pro 支持交互编辑、多参考图生成单图，但暂不支持组图生成。如果要使用供应商原生组图能力，追加同渠道的 Seedream 5.0 Lite；逐张批量生成是另一种工作流。[Seedream API](https://docs.volcengine.com/docs/82379/1541523?lang=zh)

火山当前视频文档确认 Seedance 2.5 已公开，并提供全模态参考、编辑、延长等示例；编辑示例使用 `doubao-seedance-2-5-260628` 和 `omni_reference_task_type: edit`。这为采购提供依据，但不证明项目的框选替换、移除、分段重拍已完成适配或能达到交付效果。Mini 的优惠价有时限，不应当作长期合同价。[Seedance API](https://docs.volcengine.com/docs/82379/1520757?lang=zh)

ElevenLabs 官方模型目录确认配音及音效使用不同模型 ID。Mureka 官方 API 更新日志已发布 V9.5；参考产品音乐菜单里的 V8/O2 是产品选项，采购不应因此固定旧版。[ElevenLabs 模型](https://elevenlabs.io/docs/overview/models)、[Mureka API 更新日志](https://platform.mureka.ai/docs/en/changelog.html)、[Mureka API 入门](https://platform.mureka.ai/docs/en/quickstart.html)

## 按需求追加

| 模型/渠道 | 追加条件 | 当前判断 |
| --- | --- | --- |
| Kling 3.0 Omni / Motion Control | 需要独立于 Seedance 的视频供应商，或明确需要动作控制 | 第二批候选；Omni 与动作控制需分别确认 API 权限，不能认为一个模型名涵盖全部能力 |
| Topaz 图像增强 API（现有预设为 Standard V2） | 原图修复、高清放大成为正式交付要求 | 独立增强能力，不能用通用重绘冒充；采购前补实际样本验收 |
| OmniHuman 1.5 | 上线照片加音频驱动的数字人、口播或演唱 | 已找到 BytePlus 官方 API 入口；需要按部署地区确认渠道，项目尚未适配完成 |
| Seedream 5.0 Lite | 需要原生组图生成 | 同一火山渠道补型号即可，不必再买一整套图片供应商 |
| 3D 生成服务 | 明确需要从文字/图片生成可下载的 3D 模型 | 独立选型；当前本地 3D 布景与 GLB 导入不需要购买生成模型 |

依据：[Kling 官方 API](https://kling.ai/document-api/quickStart%2FuserManual)、[Topaz API](https://developer.topazlabs.com/getting-started/quickstart)、[OmniHuman 官方产品与 API 入口](https://www.byteplus.com/zh-CN/product/OmniHuman)。这些是候选供应商自身的能力说明，不代表已经查明参考产品各工具的后台采购渠道。

## 不列入首批独立采购

- MiniMax H3/H3 Max、Wan、Vidu、Veo、Sora 等其他视频系列：先在 Seedance 两档上验证流程，确有质量、时延或稳定性缺口再增加一个备选，避免同时维护多家重复能力。
- GPT Image 与更多图片家族：先用 Seedream 和 Banana 做真实样本对比，再决定是否增加。
- 多个文字模型品牌：文字主模型已定 DeepSeek V4 Flash；视觉与视频分析单独验收，后续根据缺口补充。
- MiniMax Music 2.6 新账户采购：官方国际站公告自 2026-08-20 起音乐付费 API 不再向新用户开放，不能作为新账户首发的确定依赖。若已有合格账户，可重新比较其音乐服务。[官方公告](https://platform.minimax.io/docs/api-reference/music-generation)
- 裁剪、截帧、图片宫格切分、尺寸调整、普通剪辑拼接、3D 布景：这些属于应用和媒体处理能力，无须各买一个生成模型。

## 下单时的采购口径

采购对象是可嵌入本项目的 API 调用服务与额度。报价需列明精确模型版本、开放操作、地区、输入输出限制、并发、计量规则、额度有效期及商用/面向终端用户提供服务的条款。只写“支持 Seedance”不足以证明包含视频编辑，也不能以消费者会员代替 API 权限。

先开按量或小额测试额度，完成一个真实广告流程的样本验收后再决定预付规模。金额预算应依据预计生成量及真实成功交付率计算，本轮未获得用量计划和合同报价，因此不编造月度预算。

## 与当前代码的差距

现有代码包含 Seedream 5.0 Pro、Seedance 2.5 首尾帧、ElevenLabs 配音与音效、Topaz 等预设。DeepSeek 的平台配置及视觉输入方案、国内语音/音效、Seedance Mini、Seedance 2.5 多模态编辑/延长、Mureka 等仍需按所购 API 完成适配或验收；已有通用参数或操作类型不代表模型协议已接通。

## 国内音频替代核对

- 豆包语音合成 2.0：首选评估项。覆盖配音与情感语音；需要固定角色声线时另开声音复刻 2.0。虽然同属火山引擎，豆包语音与方舟是不同服务，不应假定同一 API Key、额度和接口可直接通用。[产品说明](https://www.volcengine.com/docs/6561/1257543?lang=zh)、[声音复刻开通说明](https://www.volcengine.com/docs/6561/1167802?lang=zh)
- MiniMax Speech 2.8：可用 `speech-2.8-hd` 做正式配音、`speech-2.8-turbo` 做快速试听。当前中国站刊例价分别为 3.50 元和 2.00 元/万计费字符；官方定义一个汉字计两个字符，纯中文一万汉字约为 7 元和 4 元，标点等另计。声音设计和快速复刻各有独立费用。音乐 API 的新用户限制不能扩展解释为语音 API 也停止开放。[官方价格](https://platform.minimaxi.com/docs/guides/pricing-paygo)、[语音 API](https://platform.minimaxi.com/docs/api-reference/speech-t2a-http)
- 阿里云 Qwen3-TTS：备用候选。系统音色、指令控制、声音复刻和声音设计对应不同模型，采购需按能力选择。[官方型号与能力](https://help.aliyun.com/zh/model-studio/tts-model)
- 独立音效：系统 Chrome 已完整读取可灵官方文生音效协议：`POST /v1/audio/text-to-audio`，提示词最多 200 字符，音效时长 3–10 秒，输出 MP3/WAV。当前读取的是国际站，鉴权文档明确示例域名 `api-singapore.klingai.com` 面向中国境外服务器，因此可确认国产模型替代候选，尚不能确认国内地域可直接采购。报价前需确认国内账号与域名的同等能力。[音效 API](https://kling.ai/document-api/api/video/audio-generation/text-to-audio)、[地域与鉴权](https://kling.ai/document-api/api/get-started/authentication)
- 腾讯 HunyuanVideo-Foley 可作为自部署视频音效候选。腾讯云旧 `SubmitVideoVoiceJob` 虽仍可搜到旧文档，但官方更新记录显示该接口在 2026-07-06 被删除，不能据旧文档列为当前可采购 API。[官方开源模型](https://huggingface.co/tencent/HunyuanVideo-Foley)、[腾讯云 API 更新记录](https://cloud.tencent.com/api/new?product=vclm)

以上国内方案尚未进行同文本、同角色的配音试听对比，也未执行生成请求。

本文件仅整理采购建议，没有修改模型配置、默认选项或价格。
