# Elren 对话操作画布：Agent Harness 选型调研

调研日期：2026-09-23。状态：官方文档、上游源码文档及本地源码核对；未安装候选框架，未进行模型对跑、付费生成、压力测试或生产部署。文档中的候选优先级是工程判断，不是已测性能排名。网页是检索当天的滚动文档，不代表已锁定的软件版本。

后续进展：同日已完成首轮实际 Harness 与 DeepSeek Flash 对照，结果见 [运行验证报告](./canvas-agent-harness-validation-2026-09-23.md)。下文保留最初调研状态，涉及实测结论以该报告为准。

## 结论

不能认定 LangGraph 是最优解。上一轮仅凭 Python 后端和检查点能力推荐 LangGraph，低估了完整 Harness 已提供的上下文管理、会话、工具执行、运行中追加指令等能力。

当前建议把 **DeepSeek Harness 与 Deep Agents 放入最终对比，先验证 DSH 的 Elren 专用配置**。理由是本地已经存在 Siran 的 DSH 派生代码，可以核对其扩展方式；DSH 上游已有 Python SDK、多模型适配和可替换工具系统。这个复用优势不等于生产稳定性已经通过：DSH 仍是开发者预览，必须固定版本并通过恢复、隔离和并发测试。

若希望尽量在现有 Python 服务内开发、减少对 Cordis 和独立运行时的维护，Deep Agents 是直接对照方案。若接受 OpenAI 托管和模型平台依赖，另评估 Agents API。Codex app-server 的嵌入能力很相关，但当前官方文档含实验性及生产支持限制，不能直接承诺作为生产基础。

保留上一轮关于画布命令接口、状态版本、生成任务复用和幂等的建议；撤回“Python LangGraph 首选已经足够明确”的判断。

## 比较对象处于不同层次

| 层次 | 提供什么 | 本次对象 |
| --- | --- | --- |
| 编排运行时 | 状态转换、检查点、等待、恢复 | LangGraph |
| 可嵌入 Agent SDK | 工具循环、类型、会话及扩展 | OpenAI Agents SDK、Pydantic AI |
| 完整 Harness | 上下文管理、工具循环、技能、子任务、运行控制 | DSH、Deep Agents、Claude Agent SDK、Codex Harness、Pydantic AI Harness |
| 托管 Agent 服务 | 平台运营 Harness、会话和执行生命周期 | OpenAI Agents API |
| 产品领域服务 | 画布、作品版本、权限、任务、用量、撤销 | Elren 自身 |

Deep Agents 建立在 LangChain/LangGraph 上；选择它并不意味着排除 LangGraph。也不能将 LangGraph 理解成只能执行固定工作流：它能承载动态 Agent，但产品级 Harness 行为需要自行组合。[LangGraph 概览](https://docs.langchain.com/oss/python/langgraph/overview)、[Deep Agents 概览](https://docs.langchain.com/oss/python/deepagents/overview)

## 候选比较

| 方案 | 已核实能力 | 对 Elren 的价值 | 需要承担的工作或限制 |
| --- | --- | --- | --- |
| DeepSeek Harness | Cordis 插件式模型、工具、会话、循环、存储和 UI；Python/TS SDK；事件日志 | 深度定制创作 Agent；可参考现有 Siran 扩展方式 | 开发者预览；独立运行时生命周期；多租户隔离；升级兼容 |
| Deep Agents | 工具、上下文压缩、文件后端、记忆、子任务、人工介入；多模型 | Python 集成直接，较裸 LangGraph 少拼装 Harness 行为 | 裁剪默认文件/编码行为；配置持久化；媒体上下文需要产品补充 |
| Codex app-server | 持续会话、流式事件、中断、steer、MCP、动态工具 | 对话与现有业务界面联动的协议很贴合 | app-server 文档有实验性/生产限制；dynamicTools 明确实验性；需隔离进程和状态 |
| OpenAI Agents API | 托管 Codex Harness，管理会话、编排、压缩及恢复；应用函数工具 | 减少运行时自建工作，可直接接画布服务 | 当前使用 beta 接口；账号权限、可用模型、数据与运营边界需核对 |
| Claude Agent SDK | Claude Code 的循环和上下文管理；Python/TS；自定义工具、会话 | 采用 Claude 体系时的完整 Harness 方案 | SDK 启动子进程，平台仍需承担部署、隔离和持久化；不应假定可任意替换模型 |
| Pydantic AI / Harness | 类型化 Agent、可组合能力、规划/记忆/上下文；持久执行集成 | 与 FastAPI 数据契约接近，适合强结构化工具 | Harness 为 0.x，次版本可能变更 API；持久执行引擎另行选型 |
| OpenAI Agents SDK | 在应用内运行工具循环、handoff 和状态管理 | 适合希望自己控制部署、存储与执行的团队 | 与 Codex Harness、Agents API 是不同产品，不自动获得全部 Codex 行为 |

来源：[DSH 官方介绍](https://www.deepseek.com/harness/en/)、[DSH 仓库](https://github.com/deepseek-ai/deepseek-harness)、[Deep Agents](https://docs.langchain.com/oss/python/deepagents/overview)、[Codex 平台集成](https://developers.openai.com/blog/codex-as-a-platform)、[Codex app-server](https://learn.chatgpt.com/docs/app-server)、[Agents API](https://developers.openai.com/api/docs/guides/agents-api/overview)、[Claude SDK](https://code.claude.com/docs/en/agent-sdk/overview)、[Pydantic AI Harness](https://pydantic.dev/docs/ai/harness/)、[OpenAI 运行时选择](https://developers.openai.com/api/docs/guides/agents)。

### DeepSeek Harness 的具体判断

它不限定使用 DeepSeek 模型。上游 `llm-pi-ai` 适配器支持多个提供方及兼容网关，具体工具调用、图像输入和上下文能力仍由模型及适配器决定。[多模型适配器](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/llm/llm-pi-ai/README.md)

Python SDK 通过 stdio JSON-RPC 启动带 `sdk` profile 的运行时，而非将整个 Harness 改成 Python 库。需要显式指定隔离的 Harness home；持续复用会话和运行时是受支持的接入方式。因此无需把 Elren 的 FastAPI 后端迁移为 Node，但会增加一层运行时管理。[Python SDK](https://github.com/deepseek-ai/deepseek-harness/blob/master/python/sdk/README.md)

最关键的恢复边界：日志可恢复，但中断的 turn 会被补齐为 interrupted；上游明确没有从中断位置继续同一 turn 的 partial-turn resume。已记录工具调用但无结果时，应核对副作用。不能把这说成已提交的视频任务会自动无重复续跑。[持久化合约与限制](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/session/session-persistence/README.md)

本地核对：当前派生仓库位于 `/Users/megumi/Develop/Siran`，upstream 为 `deepseek-ai/deepseek-harness`；读取时 HEAD 为 `fcfcc7ef87`（2026-09-21）。核对了 `docs/architecture.md`、`python/sdk/README.md`、`packages/sdk/client/README.md`、`packages/sdk/server/src/index.ts` 和会话持久化说明。旧路径 `/Users/megumi/Develop/Siran/deepseek-harness` 已不存在。当地派生实现与上游滚动源码不能视作完全相同的版本。

### Codex Harness 的具体判断

Codex 已明确支持嵌入现有业务界面：应用提供上下文和业务工具，Harness 承担会话与执行循环。适合持续交互的是 app-server；SDK 更偏程序化启动、恢复和跟踪任务。[官方产品集成说明](https://developers.openai.com/blog/codex-as-a-platform)

但同日 app-server 参考文档在远程 Code Mode 段落明确写出命令及 WebSocket 的实验性、生产工作负载支持限制；`dynamicTools` 另需实验 API 开关。官方概念文章的集成推荐不能抵消具体接口的成熟度说明。研究性原型可评估 stdio/MCP，但不应因此声称生产限制已解决。[协议与成熟度说明](https://learn.chatgpt.com/docs/app-server)

Agents API 是另一条路线：OpenAI 托管 Harness，可不配置计算环境而只接应用工具；自托管 sandbox 仅代表执行环境在自有基础设施，Harness 仍由 OpenAI 管理。[架构](https://developers.openai.com/api/docs/guides/agents-api/architecture)

当前快速开始使用 `beta.agents` / `OpenAI-Beta: agents=v1`，需要应用 API key 及对应权限。本次未检查账户实际可用性，也未调用 API。[快速开始](https://developers.openai.com/api/docs/guides/agents-api/quickstart)

### Deep Agents 与其他 Python 方案

Deep Agents 接受支持工具调用的 LangChain chat model；多模型可配置不代表任意模型在同一任务中效果一致。[模型配置](https://docs.langchain.com/oss/python/deepagents/models)

其多模态文档也说明：旧媒体消息在压缩为文字摘要后，不会继续以原图/视频形式留在活跃上下文。因此 Elren 仍需保存素材 ID、版本、用途和缩略图，并在后续编辑时重新提供相关媒体。[多模态与压缩边界](https://docs.langchain.com/oss/python/deepagents/multimodal)

Claude SDK 当前提供外部 SessionStore 接口，但持久化 transcript 不等于持久化工作目录或产品数据库；多租户需控制设置、文件、凭据和会话边界。[生产托管说明](https://code.claude.com/docs/en/agent-sdk/hosting)

Pydantic AI 的持久执行可接 Temporal、DBOS 等引擎，其官方文档明确区分“保存聊天”与“跨崩溃保持一次运行”。这一区分同样适用于所有候选。[持久执行](https://pydantic.dev/docs/ai/capabilities/durable_execution/overview/)

## 推荐的产品架构

```text
Elren 对话面板 + 当前选区
          │
          ▼
Agent Gateway（用户/项目身份、事件流、会话映射）
          │
          ▼
一个选定的 Harness（DSH 或 Deep Agents 等）
          │ 调用结构化工具
          ▼
Canvas / Asset / Generation 领域服务
          │
          ├─ 画布事务、版本冲突检查、撤销
          ├─ 素材身份、结果版本、引用用途
          └─ 现有 Task / Worker / 用量记录
```

Gateway 只统一启动/恢复、发送/追加指令、中断和事件，不再自建第二个规划循环。首轮只实现实际需要的适配接口，不同时维护多个在线 Harness。

工具以作品语义设计，例如 `read_canvas_context`、`inspect_assets`、`apply_canvas_patch`、`submit_generation`、`get_generation`、`cancel_generation`。内部先使用强类型领域接口；接 Codex/Claude 等外部 Harness 时可包装 MCP，MCP 本身不承担事务和鉴权。

创作策略可按需加载为技能，例如产品海报、角色一致性、分镜拆解和局部重做。技能提供创作方法，模型决定下一步；参数合法性、资产权限、版本和执行预算由程序校验。

区分两类图：用户画布上的素材依赖图，与 Harness 内部控制流。用户连线不应直接变成 LangGraph 的状态图；修改分镜也不应要求重建运行时。

图片/视频模型继续作为现有生成工具，由主 Agent 调度。规划模型与生成模型分别选择；换 Harness 不等于必须换图片或视频供应商。

## 不随 Harness 变化的工程工作

1. **画布权威状态**：目前快照主要在浏览器，生产级后台创作需补服务端版本和同步；原型依赖页面在线时必须明示边界。
2. **手动修改冲突**：工具携带节点/画布基准版本，旧版本补丁不能覆盖用户刚改的内容。
3. **提交幂等**：现有 `submitTask` 的 UUID 只在该次调用的网络重试中复用。Agent 恢复后重新调用可能产生新 UUID，需要持久化 action ID 与 task ID 的映射，在提交前登记并重试核对。
4. **恢复顺序**：任务提交返回 ID，等待期间结束当前执行步骤或进入持久等待；由后台事件/查询驱动继续。恢复先查任务，不能凭聊天摘要再次提交。
5. **取消和撤销**：停止 Agent、取消供应商任务、撤销画布修改是三个不同动作；不能承诺撤销会退回已发生用量。
6. **多模态身份**：保留素材原件、缩略图和用途，执行时重新解析；禁止用临时图片链接作为唯一身份。
7. **项目隔离**：所有工具通过 Elren 当前身份访问，不让模型自己声明账号；会话 ID 不等于权限边界。
8. **真实反馈**：对话进度和节点状态均来自工具/任务事实。附件内容是材料，不获得系统指令权限。

## 用什么证据决定最终方案

建议 DSH 与 Deep Agents 使用同一套领域工具、相同测试画布和提示。支持同一模型时做受控对比；无法使用同一模型时，另记为“模型 + Harness 整体”比较，不能归因于框架。Codex 托管路线须先确认实际账号能力，再决定是否加入。

| 场景 | 必须观察的结果 |
| --- | --- |
| 产品图生成三个方向 | 正确引用同一素材，创建三个独立结果，无多余提交 |
| “第二个改成竖版” | 稳定定位结果身份，只改对应分支 |
| 重名节点 | 结合选区/引用定位；真实歧义时才询问 |
| 生成中追加“先停，只保留第一张” | 新指令及时进入，未开始任务不再派发，已开始任务状态真实 |
| 后台重启 | 查询原 task ID，无重复付费生成 |
| 提交成功、回执丢失 | 同 action ID 恢复原任务，不能新建第二单 |
| 只有一个镜头失败 | 重试对应分支，保持其他结果 |
| 用户手改提示词后模型返回旧补丁 | 检测冲突，不覆盖用户内容 |
| 长对话压缩后再次编辑原图 | 能重新读取原图及用途，不能只依赖摘要 |
| 切换项目/账号 | 历史会话、素材及工具权限均不串用 |
| 撤销 Agent 一轮修改 | 按事务撤销画布变更，不误称生成消耗已撤回 |
| 模型不支持参考图/首尾帧 | 在提交前说明能力不足，不伪造参数或成功 |

先用模拟供应商验证副作用和恢复，再用已授权预算的真实模型检查创作和工具行为。每个模型/Harness 组合多次运行，记录完整成功率、错误修改数、重复提交数、用户介入次数、首次有效操作耗时、总 Token/用量、进程资源和接入代码维护量。隔离失败、无授权副作用及重复提交属于硬性失败；其余指标使用相同任务分布比较。没有对跑数据前不发布虚构分数。

## 选择条件

- **优先复用 Siran / 深度定制模型与插件**：先验证 DSH，锁定版本及精简 Elren profile；运行时与业务服务隔离。
- **优先 Python 服务内集成 / 多模型**：先验证 Deep Agents；Pydantic AI/Harness 作为强类型实现的备选。
- **优先减少 Harness 运营 / 接受 OpenAI 托管**：验证 Agents API 的账户能力和产品约束。
- **明确采用 Claude 体系**：Claude Agent SDK 进入最终对比。
- **确定流程占主导、需要精细控制每个状态**：直接使用 LangGraph 有价值，但不是仅因界面有画布就选它。

本轮只新增调研文档；没有更改前后端、安装依赖、改动 Siran、运行付费模型或执行候选基准。
