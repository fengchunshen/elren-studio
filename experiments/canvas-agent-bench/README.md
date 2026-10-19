# Canvas Agent Harness 验证台

这是隔离的选型实验，不是 Elren 已上线的 Agent 功能。两套真实 Harness 通过同一组创作工具访问合成画布；模型可以是脚本夹具，也可以是 Elren 已配置的 DeepSeek Flash。图片/视频任务始终模拟。

结果与适用边界见 [首轮验证报告](../../docs/research/canvas-agent-harness-validation-2026-09-23.md)。

## 文件

- `domain.py`：合成 SQLite 画布、版本检查、动作回执和模拟任务。
- `worker.py`：Deep Agents 和 DSH SDK 接入，禁止把真实供应商凭据传入子进程。
- `dsh_bridge.mjs`：实验性 Elren stdio 适配插件，连接 DSH 核心的创建/恢复和 steer；不是官方 SDK 修复。
- `run.py`：仅回环监听的模型/工具网关、故障注入和子进程管理。
- `evaluate.py`：根据工具记录、任务数量、版本和恢复上下文判定结果。
- `test_domain.py`：幂等及冲突的正负对照。
- `requirements.lock.txt`：本轮隔离 Python 环境的依赖版本。
- `results/2026-09-23/`：四次有效真实模型流程、十五次故障/接入流程的记录与判定；无凭据。

## 运行

在 Elren 仓库根目录执行。Python 环境和运行数据放临时目录，不修改 `server/.venv` 或平台依赖。

```bash
UV_CACHE_DIR=/private/tmp/elren-harness-uv-cache uv venv /private/tmp/elren-harness-venv --python ./server/.venv/bin/python
UV_CACHE_DIR=/private/tmp/elren-harness-uv-cache uv pip install --python /private/tmp/elren-harness-venv/bin/python -r experiments/canvas-agent-bench/requirements.lock.txt
server/.venv/bin/python -m unittest discover -s experiments/canvas-agent-bench -p 'test_*.py' -v
server/.venv/bin/python experiments/canvas-agent-bench/run.py
server/.venv/bin/python experiments/canvas-agent-bench/run.py --harness dsh-bridge
```

默认读取 `/Users/megumi/Develop/Siran` 的既有构建，可用 `--dsh-checkout /absolute/path` 替换。需要该 checkout 的 `apps/cli/lib/bin.js`、Python SDK 源码及已构建插件；程序不会自动构建或修改它。`--python` 可指定另一隔离 Python。依赖/构建变化后应重跑，不能复用历史结论。

每次自动创建独立临时输出目录；`--output` 指定固定根目录时，已有同名用例目录会拒绝覆盖。控制台最后输出 `RESULTS <目录>`。读取结构化判定：

```bash
server/.venv/bin/python experiments/canvas-agent-bench/evaluate.py /absolute/path/to/results --out /private/tmp/elren-harness-evaluation.json
```

真实模型调用须使用已获授权的测试预算：

```bash
server/.venv/bin/python experiments/canvas-agent-bench/run.py --live --repetitions 2
```

`--live` 只读本项目数据库寻找唯一已开放的 DeepSeek Flash，通过现有解密函数在网关内存中读取其渠道密钥。仅向该配置地址发送合成数据，不调用平台媒体任务、不修改业务库。每次启动上限 40 次供应商请求、每请求最多 2048 输出 Token，重复运行会重新开始这一额度限制；付费调用不是默认行为。模型用量来自供应商响应，保存在独立结果中，不进入平台正常用户消费账本。

## 用例与配置

- `chain`：读取 → 修改第二张 → 提交 → 查询。
- `conflict`：读取后注入手工修改，旧版本写入应被拒绝。
- `crash`：模拟供应商已接受任务而工具回执未送达，杀死本次测试进程组，再重开同一会话。
- `restart`：正常关闭后，新进程继续同一会话。
- `steer`：工具暂停时发送新消息，检查新指令在哪一次模型请求中可见。原 SDK 的 followup 与专用适配层的 steer 分别记录。
- `approval`：Deep Agents 在模拟提交前持久暂停，新进程批准后继续；批准前不得创建任务。

`--harness dsh` 使用本地原 SDK；`--harness dsh-bridge` 使用本实验薄适配插件；`--harness deepagents` 使用 Deep Agents。`both` 只比较原 SDK 与 Deep Agents。可用 `--case restart` 单独复测。

DSH 使用裁剪后的 `sdk-minimal`，显式加入官方 checkpoint 插件，关闭 shell 和 DeepSeek session-log 上传插件，只暴露五个领域工具。Deep Agents 保留默认的虚拟文件/子任务能力；`subagents=[]` 不会自动关掉默认 general-purpose 子 Agent，本轮线上请求实际包含十三个工具，但模型只调用了领域工具。两者外围配置不同，因此 Token/耗时仅作诊断，不能当框架固有性能排名。

模拟模型固定工具决策，只证明传输、执行和状态机制；真实模型用例才检查自然语言操作。网关将上游非流式回复转为 DSH 所需 SSE，不能用本实验比较逐 Token 流式延迟。尚未验证真实图像输入、上下文压缩、真实媒体生成、多人并发、浏览器交互或完整租户隔离。

每个 Harness 的进程退出码和完成状态均保留在证据中。`run.py` 结束不代表全部用例通过；以 `evaluate.py` 的逐项判定为准。特别是原 SDK 的恢复失败，是本轮刻意保留的反例。
