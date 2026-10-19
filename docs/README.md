# 文档索引

仓库入口见 [README](../README.md)，协作规则见 [AGENTS.md](../AGENTS.md)，平台后端运行与部署见 [server/README.md](../server/README.md)。

## 规范与进度

- [前端设计与交互规范](./frontend-ui.md)：任何前端改动前必须完整阅读。
- [工作台侧栏](./sidebar-behavior.md)：侧栏各入口的当前行为与存储边界。
- [工作流改造实施进度](./workflow-implementation-status.md)：节点改造的实现、验证与模型接入状态。

## 架构

- [对话操作画布](./canvas-agent.md)：DSH 接入、启动、操作范围、状态和验收。
- [前后端分离与模型用量计费方案](./architecture/backend-metering-plan.md)：平台模式的设计基线。

## 模型与渠道

- [国内视频制作工作流与首批 API 选择](./models/model-api-research.md)
- [模型采购建议（2026-09-10）](./models/model-procurement-2026-09-10.md)
- [三条生成链路的方舟配置](./models/model-setup-2026-09-14.md)
- [DeepSeek Flash 接入状态](./models/model-setup-deepseek.md)
- [SpacetimeAI · GPT Image 2.5 接入](./models/model-setup-spacetime.md)
- [模型库配置与测试说明书](./models/model-template-readme.md)：本地模式的模型库与请求模板。
- [即梦本地代理配置](./models/jimeng-local.md)：本地模式通过 jimeng-api 使用即梦。

## 调研与对照

- [参考产品工作流组件、输入输出与 Elren 差距核对](./research/reference-workflow-gap-audit-2026-09-08.md)
- [参考产品模型观察与公开 API 对照](./research/reference-model-catalog-2026-09-08.md)
- [参考产品组件复核：遗漏、重复拆分与入口收敛](./research/reference-component-parity-review-2026-09-09.md)
- [参考产品交互复核与 Elren 修改建议](./research/reference-interaction-review-2026-09-15.md)
- [画布交互检查（2026-09-15）](./research/interaction-audit-2026-09-15.md)
- [AI 视频制作流程调研与 Elren / 参考产品对照](./research/ai-video-workflow-research-2026-09-10.md)

## 历史

继承自上游项目的版本记录，按原样保留。

- [版本更新历史](./history/changelog.md)
- [历史更新日志（原版）](./history/历史更新日志_原版.md)
