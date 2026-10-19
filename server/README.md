# Elren Studio 平台后端与运行说明

本次实现提供账号登录、用户与项目管理、模型目录、版本化价格、任务执行、用量核算、费用明细及管理页面。保留独立本地模式；平台模式使用服务端模型调用，未开放的操作明确拒绝。

**费用记录不表示收款。系统没有充值、钱包、支付订单或支付扣款。**

## 已实现的范围

| 模块 | 当前行为 |
| --- | --- |
| 身份 | 管理员初始化、创建用户、密码哈希、服务端会话、CSRF、停用、改密和会话撤销 |
| 项目 | 后端项目归属，前端按账号和项目隔离 localStorage、IndexedDB，旧项目 JSON 主动导入 |
| 模型 | 标准文字、图片生成、图片编辑、受控 JSON 异步适配、MiniMax H3 专用适配 |
| 定价 | 原币种、人民币换算、输入/输出/缓存、图片、百万像素、视频秒数、多组件和加价；价格发布后不可修改 |
| 任务 | 幂等提交、报价绑定、独立 Worker、PostgreSQL 领取、租约心跳、重复结果去重、素材保存重试 |
| 记账 | 成本与用户费用分开、高精度金额、待核算、人工补证、追加调整和审计 |
| 前端 | 登录、原画布、文字分析请求收口、图片/视频提交与回填、任务恢复、使用明细、项目、用户、渠道、模型与价格页面 |

官方 API 调研和首批选择见 [模型调研](../docs/models/model-api-research.md)，设计基线见 [架构方案](../docs/architecture/backend-metering-plan.md)。

## 当前能力边界

- 未配置真实供应商凭据；真实账号的模型权限、采购价格和输出 CDN 域名需要在部署时确认。模拟测试不是供应商实测。
- MiniMax H3/H3 Max 已提供首帧/首尾帧适配和四个规格草稿，限制最多两张图片；多模态视频/音频参考及额外输入计费尚未开放。
- Wan 2.7 提供首帧图生视频预设；Seedream 5.0 Pro 和 Seedance 2.5 已根据官方文档提供受控模板预设，分别开放图片生成/编辑及视频首尾帧。三者都需要补充正式价格、确认账号权限与实际输出 CDN 后再开放。
- 现有 Midjourney 专有动作、视频角色创建等未完成平台协议迁移的操作会报“尚未开放”，不会回退到浏览器使用平台 Key。
- 第一版不自动重试生成提交、不自动换渠道。网络超时/5xx 后结果未知时进入核对状态；有上游 ID 则继续查询，没有 ID 则由管理员提供证据。只有读状态、读取输出和保存素材自动重试。
- 排队中的任务可以取消；已提交上游的任务暂不提供取消 API，界面明确说明会继续获取结果。
- 当前计价支持线性组件和用量步长取整。复杂分段价、输入免费额度和混合规格需拆模型条目或进一步扩展；不应将未实现的分段规则录成固定低价。
- 项目云端只保存归属和名称，画布及聊天仍在本机。媒体任务可从后端恢复到历史及节点；文字结果可在使用明细查看，未实现跨设备聊天/画布同步。
- 新增管理表单提供必要的 JSON 参数/适配配置编辑；账号级模型白名单、费用预算拦截、完整成本对账文件导入、存储计费、积分、团队协作和支付不在当前实现中。

## 本机调试（推荐）

前端、API 和 Worker 直接从本机源码运行；Docker 只运行 PostgreSQL。需要安装 Docker Desktop、Node.js、Python 3.11+ 和 uv。

**一键启动：**

```bash
# 在仓库根目录执行
./start-dev.sh
```

脚本会检查 Docker 引擎，未运行时尝试启动 Docker Desktop。开发用 Compose 文件只定义 PostgreSQL；前端、API 和 Worker 直接从本机源码运行。脚本准备依赖、执行数据库迁移后启动应用进程。访问 `http://localhost:8081`。三个进程的日志在同一个终端显示，并分别写入 `server/data/dev/web.log`、`api.log` 和 `worker.log`。该命令保持前台运行，重复执行不会启动第二套进程。

按 `Ctrl+C` 即可停止本次启动的应用进程；也可在另一个终端执行：

```bash
./stop-dev.sh
```

重复运行启动脚本会提示已有实例，不会重复启动。API／前端保留父进程监测，Worker 也会在一键管理进程异常退出后正常结束当前工作步骤并退出，避免留下占用 8000 的孤立服务。API 端口冲突会在变更 Docker 服务前报出；如果旧的平台镜像应用容器正在运行，脚本也会报出冲突，不会自动停止它们。

退出后数据库保持运行，不删除数据库卷或素材。等价 npm 命令为 `npm run dev:all` 和 `npm run dev:stop`。如果某个应用进程异常退出，脚本会停止本次启动的其他应用进程，并提示检查日志。需要单独停止开发数据库时执行 `docker compose --env-file server/.env.platform -f compose.dev.yaml stop db`。

### 分终端运行（可选）

在仓库根目录准备环境（首次使用或切换运行方式时执行）：

```bash
npm run dev:setup
```

脚本读取已有的 `server/.env.platform`，只启动 PostgreSQL 并将其映射到本机 55432，不会启动或停止镜像版 web/api/worker。开发数据库沿用原平台数据库卷，现有账号和项目记录继续使用，不重置管理员密码。首次切换时会把已有容器素材复制到 `server/data/assets`，不会覆盖内容不同的同名文件。若旧镜像应用仍在运行，请先自行决定何时停用，再启动本机开发服务。

然后开三个终端，工作目录均为仓库根目录：

```bash
# 终端 1：前端 Vite，React/CSS 热更新
npm run dev:web
```

```bash
# 终端 2：后端 API，Python 源码修改后自动重载
npm run dev:api
```

```bash
# 终端 3：模型任务 Worker
npm run dev:worker
```

| 服务 | 地址 | 更新方式 |
| --- | --- | --- |
| 前端 | http://localhost:8081 | Vite 热更新 |
| API | http://127.0.0.1:8000 | Uvicorn 自动重载 |
| API 文档 | http://127.0.0.1:8000/docs | 随后端源码更新 |
| 数据库 | 127.0.0.1:55432 | Docker 中原有的 PostgreSQL |
| Worker | 无 HTTP 端口 | 检测 Python 代码变化，等当前工作步骤结束后自动重启 |

浏览器始终使用 `http://localhost:8081`，与原有浏览器存储和登录来源保持一致。Vite 将 `/api` 转发到本机 API，因此前后端无需额外配置跨域。

修改端口时，将 `server/env.development.example` 复制为 `server/.env.development` 后编辑，再重新准备并启动各进程。前端代理、后端登录来源及数据库连接会同步使用这套配置，不读取其他项目终端中遗留的 `DATABASE_URL`。

管理员可在“渠道管理 → 编辑”直接录入或替换 API Key，保存后无需重启，Worker 在后续请求中读取最新凭据。原 `server/.env.providers` 继续作为兼容回退；网页保存的渠道密钥优先。修改端口后需要重启对应进程。数据库结构有新迁移时执行：

```bash
npm run dev:migrate
```

各终端按 `Ctrl+C` 停止该进程；Worker 会等待当前工作步骤结束，再次按 `Ctrl+C` 可强制结束。停止应用进程不会删除数据库或素材。

调试期间无需启动 Docker 里的 web/api/worker。开发用 `compose.dev.yaml` 只包含数据库。原部署编排中的 `migrate-1` 是一次性任务，`Exited (0)` 表示迁移成功，属于正常状态。不要反复点击它的启动按钮。

当前开发模式使用本机 `server/data/assets`，原容器素材卷保留。以后若切回镜像运行，需要同步本机新增素材到容器素材卷，避免数据库中的素材记录找不到文件。

普通 `npm run dev` 继续作为原纯前端模式保留；调试前后端分离版本请用上面的 `dev:web`、`dev:api`、`dev:worker` 命令。发布打包仍用 `VITE_PLATFORM_MODE=true npm run build`。

## Docker Compose

平台使用独立的 `compose.platform.yaml`，不会替换已有本地接收器的部署文件。

```bash
export ELREN_DB_PASSWORD='YOUR_RANDOM_PASSWORD'
export PUBLIC_ORIGIN='http://localhost:8081'
export COOKIE_SECURE=false
docker compose -f compose.platform.yaml up -d --build
docker compose -f compose.platform.yaml exec api python -m app.cli create-admin --username admin
```

数据库密码放进 URL 时需使用 URL 安全字符，或正确进行 URL 编码。API 和 Worker 共用持久化素材卷，迁移服务成功后才启动。前端默认只绑定本机 8081。

推荐通过管理后台“渠道管理”配置供应商凭据。旧部署也可继续使用 `server/.env.providers`，该文件被 Git 和 Docker build context 排除：

```text
ELREN_PROVIDER_MINIMAX=YOUR_PROVIDER_KEY
ELREN_PROVIDER_DASHSCOPE=YOUR_PROVIDER_KEY
ELREN_PROVIDER_ARK=YOUR_PROVIDER_KEY
```

Compose 将旧环境凭据同时注入 API 和 Worker，以支持渠道状态与连接测试；旧环境文件更新后需重建这两个容器。网页保存的密钥不需重启。不要把凭据写入模型模板、项目文件或前端环境变量。

### 从更名前的部署迁移

2026-09-22 起，环境变量前缀、Compose 项目、数据库用户与库名、登录 Cookie 均由 `tapnow` 改为 `elren`。旧部署需迁移一次；过程不修改旧数据库卷，确认新环境正常后再清理。

1. 环境文件只改变量名（Linux 的 `sed -i` 不带 `''`），shell 中导出的 `TAPNOW_*` 同样改名：

   ```bash
   sed -i '' -E 's/^([[:space:]]*(export[[:space:]]+)?)TAPNOW_/\1ELREN_/' server/.env.platform server/.env.providers
   ```

2. 导出旧库，启动新库并导入。本机调试将下面命令中的 `-f compose.platform.yaml` 替换为 `-f compose.dev.yaml`；部署环境导入后执行 `up -d --build` 启动其余服务：

   ```bash
   docker start tapnow-platform-db-1
   docker exec tapnow-platform-db-1 pg_dump -U tapnow -d tapnow -Fc > legacy-db.dump
   docker stop tapnow-platform-db-1
   docker compose --env-file server/.env.platform -f compose.platform.yaml up -d --no-deps --wait db
   docker exec -i elren-platform-db-1 pg_restore -U elren -d elren --no-owner --no-privileges --exit-on-error < legacy-db.dump
   npm run dev:migrate
   ```

3. 核对两边各表行数一致后删除 `legacy-db.dump`，其中含会话等敏感数据。
4. 迁移 `0004` 把渠道凭据引用改为 `ELREN_PROVIDER_*`。网页保存的加密密钥绑定渠道 ID，不受影响。
5. 登录 Cookie 改名后需要重新登录一次。
6. 浏览器中的项目、历史、素材库和设置会在首次打开新版本时自动迁移（`src/services/legacyStorage.js`）。迁移失败时停在启动错误页，不会带着缺失的数据进入编辑器。
7. 确认无误后清理旧对象：

   ```bash
   docker rm tapnow-platform-db-1 tapnow-platform-api-1 tapnow-platform-worker-1 tapnow-platform-web-1 tapnow-platform-migrate-1
   docker volume rm tapnow-platform_platform_db tapnow-platform_platform_assets
   docker image rm tapnow-platform-api tapnow-platform-worker tapnow-platform-web tapnow-platform-migrate
   ```

网页密钥使用 Fernet 加密，密文存于 `channel_credentials` 表；主密钥自动生成在素材目录的同级 `secrets/channel.key`（本机为 `server/data/secrets/channel.key`，Docker 为共享卷 `/app/data/secrets/channel.key`），文件权限 0600。API 与 Worker 必须使用相同共享目录，也可用 `CHANNEL_KEY_DIR` 指定安全目录。备份时同时备份数据库和该主密钥，限制备份访问；主密钥丢失不能解密，必须恢复或重新录入供应商 Key。读取失败不会自动创建替代主密钥或退回旧凭据。

渠道编辑留空 API Key 保留原值，保存只返回配置状态；真实密钥和密文不进入接口响应或审计详情。测试连接使用当前表单值，只读取供应商模型列表，不保存表单、不创建生成任务；不支持模型列表的渠道会明确提示未验证，测试成功不代表生成权限、余额或所有模型可用。已有任务的渠道仍保留地址不可变约束，密钥可直接轮换。

公网部署时使用 HTTPS 入口，配置真实 `PUBLIC_ORIGIN` 和 `COOKIE_SECURE=true`；数据库及 Worker 不暴露公网端口。备份 `platform_db`、`platform_assets` 和部署密钥，恢复时保持用户、任务与素材 ID 一致。

## 模型上线流程

SpacetimeAI 的 GPT Image 2.5 预设与待实测配置见 [SpacetimeAI 接入说明](../docs/models/model-setup-spacetime.md)。

本项目 2026-09-14 已确认的三条生成链路、方舟共用 Key、计费规则和实测记录见 [方舟模型配置](../docs/models/model-setup-2026-09-14.md)。

1. 登录管理员账号，在“模型”里导入官方 API 预设，或手动新增渠道与模型。
2. 在渠道管理页填写 API Key 并测试连接。渠道地址必须为 HTTPS；输出素材 CDN 要加入允许域名列表。
3. 创建成本和售价两个价格版本。售价里的 `unit_price` 是加价前参考单价，`markup=0.2` 表示增加 20%；成本的加价必须为 0。同币种汇率必须为 1。
4. 分别发布两种价格，然后开放模型。未配置完整价格的模型不会出现在普通用户列表。
5. 使用少量请求验证输出、原始用量、实际规格和费用，核对供应商记录后再扩大使用范围。

预设导入保持幂等，不覆盖已有模型或价格。MiniMax 草稿中的 20% 为建议加价，并不自动发布。重新制定价格时创建新版本；旧任务使用锁定的售价。

当前参数格式示例：

```json
{
  "max_tokens": {"type": "integer", "min": 1, "max": 8192, "default": 2048},
  "temperature": {"type": "number", "min": 0, "max": 2, "default": 0.7}
}
```

价格组件示例（单价为说明性数据，不是任何真实模型的报价）：

```json
[
  {"meter": "input_tokens", "unit_size": "1000000", "unit_price": "2"},
  {"meter": "output_tokens", "unit_size": "1000000", "unit_price": "4"},
  {"meter": "cache_read_tokens", "unit_size": "1000000", "unit_price": "0.2"}
]
```

`openai_chat` 按标准兼容协议将缓存命中从输入总量中扣除，输出 Token 不再重复叠加 reasoning 子项。若某渠道采用不同语义，需要实现其适配器，不应套用默认规则。

`json_async` 使用声明式模板；`{{model}}`、`{{input.prompt}}`、`{{input.parameters.duration}}`、`{{assets.0.data_url}}` 等完整占位符保留其数据类型。模板不执行 JavaScript/Python。配置包括提交路径、状态路径、状态值、输出路径和 `usage_paths`，可参考代码中的 Wan 预设。

## 核算与调整

任务执行状态与费用状态独立。`pending` 表示证据不足；`recorded` 表示已有用户费用；`not_billable` 表示根据规则不计入用户费用。成本另有 `calculated` 状态，表示按渠道价目表推算，不代表已经收到供应商账单。

管理员可从费用明细定位任务，在 `/admin/tasks/{id}/reconcile` 提交用量证据。上游任务 ID 已知时可以补充 `remote_id` 继续查询；依据明确证据确认未成功的未知任务可提交 `outcome: "failed"`。

已入账的费用不因再次核对被覆盖。更正使用 `/admin/charge-adjustments`，提供原分录 ID、带符号的人民币调整金额、原因和幂等键。成本与用户金额分别调整，汇总包含调整净额。

## 验证

普通测试使用独立临时 SQLite 文件，不访问供应商：

```bash
cd server
uv run pytest -q
```

数据库锁和并发测试需使用明确命名的、可丢弃的 `elren_test` 数据库。测试会重建该库中的平台表，不能指向业务库：

```bash
ELREN_TEST_DATABASE_URL='postgresql+psycopg://elren:TEST_PASSWORD@127.0.0.1:55432/elren_test' uv run pytest -q
```

测试覆盖账号隔离、CSRF、用量分类、价格锁定、报价篡改、并发幂等、缺失用量、未知提交、部分成功、素材保存重试、费用调整及官方协议形态。`tests/mock_provider.py` 仅供本机浏览器联调，固定返回模拟内容，不得配置到正式渠道。

`ALLOW_PRIVATE_PROVIDERS=true` 只用于显式的隔离本地联调；正式部署保持默认关闭。数据库、素材目录和模拟供应商必须与正式配置隔离。

本次验证记录：PostgreSQL 测试 19 项通过，Alembic 未发现遗漏迁移，平台和本地两种前端构建通过，Compose 配置校验通过。系统 Chrome 已验证登录、模拟模型返回、精确费用明细、账号切换与数据隔离。后端 Docker 镜像在 Python 3.12 下完成构建，并以非 root 用户完成临时数据库迁移和 API 加载。没有部署正式环境，也没有执行真实供应商生成请求。

### 视频专用编辑合约（2026-09-10）

`video.replace`、`video.remove`、`video.retake`、`video.extend` 现在需要 `input.video_edit` 版本 1。配置模型时使用 `config.video_edit_contract: 1`，并在渠道 `body` 中显式映射 `{{input.video_edit}}` 或该操作的 `target`、`shots`、`extension` 对象。仅配置 operation 或通用 prompt 不再允许执行这些专用编辑。此合约是编辑器内部数据结构，并非某家供应商的已核实协议；正式开放前必须按真实服务文档配置映射、结果形态及价格，再验收。

- `source_duration`：原片秒数。
- 替换／移除：`target: {time, box: {x, y, width, height}}`，矩形坐标相对于完整目标帧归一化到 0–1；参考必须有一个视频 `source` 和一张图片 `target_frame`，替换另需一张 `replacement` 图片。
- 重拍：`shots: [{start, end, camera, framing, motion, prompt}]`，按原片时间排序、不重叠，最多 20 段。
- 延长：`extension: {direction: "before" | "after", duration}`，duration 是新增秒数。具体结果是否包含原片由供应商定义；客户端保留原节点，结果写入处理节点。
- 素材仍通过 `asset_ids` 和 `references` 提交；必须属于当前账号和项目，未分配用途或错误类型的素材会被拒绝。编辑配置随任务报价输入和任务快照保存。
- `/models` 的 `inputs.videoEdit` 暴露合约能力；音频用途通过 `config.audio_purpose`（`speech`、`music`、`sound`）配置，公开为 `inputs.audioPurpose`。这些配置不会自动开放模型、导入价格或执行付费请求。

验证：`PYTHONPATH=$PWD/server uv run --project server pytest server/tests/test_video_edit.py -q`。测试使用模拟渠道，不是供应商实跑。
