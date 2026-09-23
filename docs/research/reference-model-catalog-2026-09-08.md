# 参考产品模型观察与公开 API 对照

本轮在已登录的系统 Chrome 核对，页面显示 v2.15.9。以下是产品显示的模型名，不自动视为可直接调用的 API ID，也不能据此确认参考产品后台采购渠道。账号锁定项与可选项分开看待。

| 用途 | 参考产品实际可见 | 本项目接入处理 |
| --- | --- | --- |
| 音频 | Mureka V8、Mureka O2、Seed audio 1.0、MiniMax Music 2.6、ElevenLabs V3、Sonilo Music | 已建立音频节点及受控多媒体调用。ElevenLabs 配音/音效、MiniMax Music 2.6 已有协议预设；其他型号的公开 API 与账号权限继续核实 |
| 数字人 | OmniHuman 1.5 | 图片＋音频输入与 video.avatar 操作已建；公开协议、服务账号仍待确认 |
| 图像增强 | Topazlabs；另有皮肤编辑器页签 | 已实现 Topaz 官方 Standard V2 异步增强预设；参考产品未显示具体 Topaz 子模型，不能宣称其后台也是 Standard V2 |
| 图片编辑 | 官方文档列出 GPT Image 2、Banana Pro、Seedream 5.0 Pro | 已有 Seedream 5.0 Pro 预设。专用处理 operation 与通用图片编辑区分，不能用任意提示词抵充所有专用模型 |
| 视频主力与编辑 | Seedance 2.0 Mini / 2.0 / 2.0 Fast / 2.5；MiniMax H3 / H3 Max；Kling 3.0 Omni，以及独立视频编辑选项 | 沿用已核对的 Seedance 和 H3 基础预设；多模态、编辑、多镜头通过显式模型能力配置启用 |
| 3D | 当前账号的“3D 生成”全局入口禁用；3D 片场可进入 | 已实现本地 3D 布景、GLB 导入、取景图与模型操作类型。未确认其 3D 生成具体型号，不编造 Tripo/Meshy 等对应关系 |

音频与视频菜单已实际打开，数字人通过音频右侧入口创建后显示 OmniHuman 1.5。

## 视频菜单的其他可见选项

本轮菜单还包括：Wan 2.2 / 2.2 Flash / 2.5 / 2.6 / 3.0，Kling O1 / O1 视频编辑 / 3.0 Omni 视频编辑 / 3.0 / 2.1 / 2.5 / 2.6 / 2.6 动作迁移，Gemini Omni Flash / Omni 1.1 Flash，HappyHorse 1.0 / 1.1 / 1.0 视频编辑，Grok Imagine / Imagine 1.5，Seedance 1.0 Pro / 1.5 Pro，MJ Video，Hailuo-02 / 2.3 / 2.3 Fast，Vidu Q2 / Q2 Pro / Q2 Turbo / Q3，FLUX 3，VEO3.1 / 3.1 Fast / 3.1 Lite，Sora 2 / 2 Pro。

这份清单用于后续适配核对，**不直接复制展示名作为 upstream_model**。独立的模型版本、生成模式和收费规格应对应可验证的 offering。

## 文字菜单

当前选中 Gemini 3.1 Flash Lite，DeepSeek V4 Pro 可见；菜单还有 Gemini 3.5 Flash、3.6 Flash、3.1 Pro、3 Flash，Grok 4.6，GPT-5.6 Sol / Terra / Luna、GPT-6 Astra，Claude Opus 5、Claude Fable 5，多数显示锁定。上述内容仅记录参考产品页面展示；没有据此验证任何供应商公开 API 的同名型号。

## 已核实并写成预设的新增协议

- **ElevenLabs 配音**：`POST /v1/text-to-speech/{voice_id}`，使用 `xi-api-key`；官方确认 `eleven_v3` 可用于语音生成。输出二进制音频，voice_id 应取账号可用的声音。[语音接口](https://elevenlabs.io/docs/api-reference/text-to-speech/convert)、[V3 型号说明](https://elevenlabs.io/docs/help-center/product/core-capabilities/text-to-speech/what-is-eleven-v3-alpha)
- **ElevenLabs 音效**：`POST /v1/sound-generation`，公开型号为 `eleven_text_to_sound_v2`；返回音频，`character-cost` 响应头可提供计费字符数。不能把界面的“V3”标签当成音效接口型号。[音效接口](https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert)
- **MiniMax Music 2.6**：`POST https://api.minimax.io/v1/music_generation`，可请求 URL 输出，返回音乐时长以毫秒计。**官方国际站已公告，2026-08-20 起音乐付费 API 不再向新用户开放，原有付费账号可继续使用。** 新用户不能仅凭拥有普通 MiniMax Key 就假定该模型可用。[音乐接口与公告](https://platform.minimax.io/docs/api-reference/music-generation)
- **Topaz Standard V2**：`POST /image/v1/enhance/async` 上传 multipart 图片，使用 `X-API-Key`；按 process_id 查询 `/image/v1/status/{id}`，完成后调用认证的 `/image/v1/download/{id}` 取得结果 URL。该预设采用官方示例，输出 CDN 白名单与实际价格仍须按账号配置。[Topaz 官方 Quickstart](https://developer.topazlabs.com/getting-started/quickstart)

预设位于 `server/app/creative_presets.py`。它们只提供可复核的接入配置，不包含密钥，不自动发布价格或开放模型。本轮协议测试使用模拟供应商响应，未运行付费生成。

当前未核实项：Mureka / Seed Audio / Sonilo 的具体账号接入、OmniHuman 的可用服务协议，以及参考产品灰度 3D 型号。获取这些信息后继续扩展预设；现有通用适配器不能替代真实协议与计费验证。

## 2026-09-14 普通用户实机补充

来源：系统 Chrome 已登录的参考产品画布。本轮只查看和切换入口，没有在参考站提交生成或购买。下列是产品界面当时展示，不代表本项目已采购或供应商公开 API 全部支持。

### 模型与生成入口

- 图片列表实际可见：Nano Banana 2 Lite、Seedream 5.0 Lite/Pro、Seedream 4.0/4.5、GPT Image 2.5 Flare/Sunburst、GPT Image2、Banana 2/Pro/Banana、MJ V7/V8.2/V8.1/Niji7、Flux Max/Flux、Recraft V4/矢量版、Grok2 Image、Reve 2.1、Grok Imagine/Quality。每行是图标、名称、NEW/热门等产品标签及最大画质；菜单没有管理模型、API 或预设配置入口。
- 视频列表实际可见：Seedance 2.0 Mini、1.5 Pro、2.0、2.0 Fast、2.5；Wan 2.6/3.0/2.2/2.2 Flash/2.5；MJ Video；Hailuo-02/2.3/2.3 Fast；MiniMax H3/H3 Max；Vidu Q2/Q2 Pro/Q2 Turbo/Q3；Kling 3.0 Omni/3.0/O1/2.6/2.1/2.5；FLUX 3；Gemini Omni Flash/1.1 Flash；HappyHorse 1.0/1.1；VEO3.1 Lite/Fast/标准版；PixVerse 5.5/5.0；Sora 2/Pro；Grok Imagine 1.5/Imagine；另有视频编辑、动作迁移、OmniHuman 条目。产品目录与本项目按能力开放的列表须分开。
- 文本列表实际可见：Gemini 3.1 Flash Lite、DeepSeek V4 Pro、Gemini 3.5/3.6 Flash、Gemini 3.1 Pro/3 Flash、Grok 4.6、GPT-5.6 Sol/Terra/Luna、GPT-6 Astra、Claude Opus 5/Fable 5；不少选项在当前账号被禁用。行内展示用途、质量/速度和预估耗时，不能把观察到的禁用项当作已可用。
- 模型菜单宽约 280px，纵向滚动，当前项有中性底色和勾；优先在触发器下方显示，空间不足避让。规格在旁边单独展开，不跳转管理页面。
- 图片规格本次观察到画质和比例分组。视频 Mini 规格包含生成方式（首尾帧/全能参考）、比例、清晰度、时长、音频开关；部分选项受账号权限限制。界面上模型最大能力与当前用户可选范围是两个概念。
- 生成数量是独立小菜单，生成按钮旁展示该产品的消费量。Elren 没有对应积分/会员实现，因此不复制或虚构 Tapies 数字。

### 用户入口与本项目落实

参考产品左侧栏末端头像展开个人资料、当前方案、团队/个人主页、语言、Tapies、账户管理、更新/帮助等用户入口。未看到任何渠道或 API 配置。Elren 按已实现能力提供工作空间、使用记录、账户管理（含修改密码）、退出；管理员另外有一个跳转独立后台的入口。

本次将管理配置移到独立 `/admin/*` 页面；节点、项目菜单和侧栏不再提供管理模型入口。后端 `/admin/*` 保持角色校验；普通用户 `/models` 只返回已开放模型和创作所需参数，不返回渠道配置、上游标识或凭据引用。

创建普通用户 `creator` 做真实验收，项目独立；凭据只保存在被忽略的 `server/data/creator-login.txt`。普通用户浏览器访问后台显示拒绝；真实接口检查模型、渠道、预设、价格、用户、费用、审计均返回 403。管理员实机已验证模型搜索、编辑保存、预设列表、渠道、价格版本、用户和成本页面。

本轮验证：前端相关测试 20 项通过；后端 57 项通过、1 项跳过；平台模式构建通过。普通用户实机覆盖头像、账户管理、项目菜单、侧栏更多、图片与视频模型选择、模型切换、音频开关、图片到视频连线及后台拒绝访问。本轮没有新增付费生成。
