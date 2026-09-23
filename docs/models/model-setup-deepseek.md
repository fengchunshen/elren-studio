# DeepSeek Flash 接入状态

2026-09-22：已添加官方 `deepseek-flash` 文本预设。用户授权按官方价格配置成本与售价，零加价，使用自动峰谷计费。现有图片、视频模型不变。

- 请求：`https://api.deepseek.com/chat/completions`，复用 `openai_chat`。
- 默认 `reasoning_effort=none`、`max_tokens=4096`；支持 none/low/high/max。本次只开放文本输入。
- 凭据：打开管理后台 → 渠道管理 → DeepSeek 官方 → 编辑，在 API Key 输入框粘贴密钥。点击“测试连接”读取模型列表，再“保存”。保存后立即用于后续请求，不需要编辑服务器文件或重启 Worker。
- 缓存命中优先读取 `prompt_cache_hit_tokens`，从总输入扣除，输出按 `completion_tokens` 核算。
- 成本与售价相同，人民币、零加价，每百万 Token：高峰输入 2 元、缓存命中 0.04 元、输出 8 元；空闲输入 1 元、缓存命中 0.02 元、输出 4 元。
- 北京时间周一至周五 09:00–12:00、14:00–18:00 为高峰（含开始、不含结束），其余时段含周末按空闲价。计费项保存规则版本 `deepseek_cn_peak_v1` 与两档单价，历史快照不变。
- 平台按供应商响应 `created` 判断时段，保存时间依据和实际单价；缺失或异常时间保持待核算。官方价格页未明确跨时段长请求的计价时间点，此为平台执行口径，跨边界任务仍需与供应商账单核对。成本状态为按价目表计算，不冒充已取得供应商账单。
- 用户已在渠道页保存 Key。本次发布成本/售价并开放模型；模拟供应商已验证文本结果与双账本入账，未执行新的付费生成。连接测试不验证生成权限或余额。

验证命令（模拟供应商，不使用真实 Key）：

```sh
PYTHONPATH=server server/.venv/bin/python -m pytest server/tests/test_deepseek.py server/tests/test_platform.py -q
```

官方依据：[接口](https://api-docs.deepseek.com/api/create-chat-completion/)、[价格](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/)。

## 本机 Fake-IP 冲突修复（2026-09-22）

本机 Clash 将 `api.deepseek.com` 解析为 `198.18.1.67`，触发 Worker 的公网地址检查，任务在发送前以 `preflight_rejected` 结束。已仅将 `api.deepseek.com` 加入 Clash 全局脚本及当前配置的 `dns.fake-ip-filter`，保留原路由和后端内网访问保护。原配置已就地备份，脚本语法与 Mihomo 配置校验通过，重载返回 204。

修复后系统 DNS 返回公网地址，`validate_remote_url` 通过，使用已保存密钥的只读 `/models` 请求成功。未重发历史任务或执行付费生成。IP 会变化，不要固定本次解析结果。若代理配置以后被替换，请检查同一域名的 Fake-IP 排除项；不要通过开启 `ALLOW_PRIVATE_PROVIDERS` 规避检查。[Mihomo DNS 配置说明](https://wiki.metacubex.one/config/dns/)
