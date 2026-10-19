# Elren Studio

Elren Studio 是运行在浏览器中的节点式 AI 创作画布：把文本、图片、视频、音频和 3D 生成放在同一张无限画布上，用连线组织从脚本、分镜到成片的完整流程。项目同时提供可选的平台后端，负责账号、模型目录、任务执行和用量计费，让团队成员无需各自持有供应商 API Key。

## 功能

**画布与节点**

| 分类 | 节点 |
| --- | --- |
| 内容 | 文本、图片、视频、音频、3D |
| 辅助 | 剪辑时间线、图片编辑器、3D 片场 |
| 扩展 | 智能分镜、脚本提取、视频拆解、图像对比 |
| 派生 | 数字人视频、图片处理、视频处理 |
| 高级 | 结果监看、自动归档 |

节点之间按输入输出连线，生成结果回填到节点并进入生成历史。各节点的实现与验收状态见[工作流改造实施进度](./docs/workflow-implementation-status.md)。

**工作台**

- 项目主页：新建、复制、重命名项目，每个项目的画布与素材按账号和项目隔离保存。
- 侧栏：新增节点、节点搜索、素材库、工作流模板、画布评论、生成历史。
- AI 对话、项目导入导出（JSON 或含素材的 ZIP 资产包）。
- 平台画布助手：通过对话创建、修改和连接节点；确认后使用现有模型生成。部署与范围见[画布助手说明](./docs/canvas-agent.md)。
- 深色、浅色与 Solarized 主题，中文与英文界面。

**平台模式（可选后端）**

- 账号与项目：管理员创建用户，服务端会话与 CSRF 防护。
- 模型目录：管理员配置渠道和模型，创作者只看到已开放的模型及其能力。
- 版本化价格：成本价与售价分开，发布后不可修改，任务提交时锁定报价。
- 任务执行：独立 Worker 从 PostgreSQL 领取任务。结果未知的提交进入核对状态，不自动重试，也不自动换渠道。
- 用量记账：成本与用户费用分开记录，更正走调整分录。系统只记录费用，不含充值与支付。
- 管理控制台：用户、渠道、模型、价格、用量与成本、操作记录。网页录入的渠道密钥加密存储，接口永不返回明文。

## 两种运行模式

| | 本地模式 | 平台模式 |
| --- | --- | --- |
| 适用 | 个人使用，自带 API Key | 团队使用，由管理员统一管理模型与费用 |
| 模型调用 | 浏览器直连供应商（即梦等需本机代理） | 前端提交任务，后端 Worker 调用供应商 |
| API Key | 保存在当前浏览器 | 只保存在服务端 |
| 构建 | `npm run build` | `VITE_PLATFORM_MODE=true npm run build` |

本地模式可接入 OpenAI 兼容接口、Gemini、即梦、Midjourney、Grok、DeepSeek 等，也可通过请求模板对接其他服务，配置方法见[模型库说明](./docs/models/model-template-readme.md)。平台模式内置火山方舟（Seedream、Seedance）、阿里云百炼、MiniMax、DeepSeek、SpacetimeAI、ElevenLabs、Topaz 等渠道预设；预设需管理员补充凭据和正式价格后才对创作者开放。

## 快速开始

本地模式需要 Node.js 20+；平台画布助手需要 Node.js 24+。平台模式另需 Docker Desktop、Python 3.11+ 和 [uv](https://docs.astral.sh/uv/)。

### 本地模式

```bash
npm install
npm run dev          # http://localhost:5173
```

在项目菜单的“API 设置”中填入模型 Key 即可使用。即梦需先启动本机代理，见[即梦本地代理配置](./docs/models/jimeng-local.md)。`npm run build` 会生成单文件静态页面 `dist/index.html`。

### 平台模式（本机调试）

1. 创建 `server/.env.platform`（已被 Git 忽略），写入数据库密码：

   ```bash
   ELREN_DB_PASSWORD=<随机密码>
   ```

2. 一键启动。Docker 只启动 PostgreSQL；脚本安装依赖、执行数据库迁移，再从本机源码启动前端、API 和 Worker：

   ```bash
   ./start-dev.sh       # 前端 http://localhost:8081，API 文档 http://127.0.0.1:8000/docs
   ```

3. 首次使用时，在另一个终端创建管理员：

   ```bash
   cd server
   DATABASE_URL='postgresql+psycopg://elren:<随机密码>@127.0.0.1:55432/elren' uv run python -m app.cli create-admin --username admin
   ```

   密码含 `@`、`:`、`/` 等字符时需先做 URL 编码。

4. 用管理员登录，在管理控制台的“渠道管理”录入供应商 API Key，再配置模型并发布价格。完整的模型上线流程见[后端运行说明](./server/README.md#模型上线流程)。

按 `Ctrl+C` 或执行 `./stop-dev.sh` 停止应用进程；数据库保持运行，数据和素材保留。分终端运行、端口修改等见[本机调试说明](./server/README.md#本机调试推荐)。

### 部署

- 平台模式：`compose.platform.yaml` 包含数据库、迁移、API、Worker 与 Nginx 前端，见[后端运行说明](./server/README.md#docker-compose)。
- 本地模式：`docker-compose.yml` 启动静态前端与本地接收器，见 [Docker 部署说明](./localserver/Docker_README.md)。

## 本地接收器（本地模式可选）

`localserver/` 是本机 Python 服务（端口 9527），提供生成结果的本地缓存与保存、跨域代理以及 ComfyUI 中间件接入，见[本地接收器说明](./localserver/LocalServer_README.md)和 [ComfyUI 代理说明](./localserver/Middleware_README-ComfyUI.md)。

## 开发

```bash
npm test                                   # 前端测试（Vitest + jsdom）
npx vitest run tests/editor-smoke.test.jsx # 单个文件；全量不稳定时加 --no-file-parallelism
cd server && uv run pytest -q              # 后端测试，默认使用临时 SQLite，不访问供应商
npm run dev:migrate                        # 执行数据库迁移（修改模型结构需新增 Alembic 迁移）
```

修改前端前请先阅读[前端设计与交互规范](./docs/frontend-ui.md)，协作约定见 [AGENTS.md](./AGENTS.md)。

**技术栈**：React 18、Vite 5、Tailwind CSS 3、shadcn/ui（Radix）、i18next；FastAPI、SQLAlchemy、Alembic、PostgreSQL 16。

**目录结构**

```text
src/                  前端源码
  App.jsx             编辑器主组件（历史单体，新逻辑优先放到下列目录）
  components/ui/      shadcn/ui 基础组件
  components/editor/  画布、节点与侧栏等业务组件
  lib/                纯逻辑模块（单元测试的主要对象）
  services/           本地存储、平台接口与任务提交
  platform/           登录、项目选择与管理控制台
  i18n/               中英文文案
server/               平台后端：API、Worker、供应商适配、数据库迁移与测试
localserver/          本地接收器与即梦一键包
tests/                前端测试
docs/                 规范、架构、模型接入与调研文档
docker/               Dockerfile 与 Nginx 配置
examples/             示例项目与演示素材
scripts/              构建辅助脚本（首屏加载画面）
dev.py                本机调试启动器（start-dev.sh / stop-dev.sh 调用）
```

## 文档

完整索引见 [docs/README.md](./docs/README.md)，常用入口如下：

- [前端设计与交互规范](./docs/frontend-ui.md)
- [前后端分离与模型用量计费方案](./docs/architecture/backend-metering-plan.md)
- [平台后端运行说明](./server/README.md)
- [历史版本记录](./docs/history/changelog.md)

## 许可证与声明

本项目采用 [GPL-3.0](./LICENSE) 许可证。

使用第三方模型服务时请遵守相应服务商的条款，生成费用由服务商收取。本地模式下 API Key 只保存在你的浏览器中，不会上传；平台模式下供应商密钥只保存在服务端。即梦代理基于 [jimeng-api](https://github.com/iptag/jimeng-api)，图标来自 [Lucide](https://lucide.dev/)。
