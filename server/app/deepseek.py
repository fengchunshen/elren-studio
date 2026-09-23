"""Official DeepSeek text preset; importing never enables billing or generation."""


def deepseek_presets():
    return [{
        "id": "deepseek-flash", "name": "DeepSeek Flash",
        "source": "https://api-docs.deepseek.com/api/create-chat-completion/",
        "note": "官方 deepseek-flash，文本创作与对话，默认非思考模式。官方人民币峰谷价，零加价；北京时间周一至周五 09–12、14–18 时为高峰，其余半价。",
        "sale_markup": "0",
        "channel": {"name": "DeepSeek 官方", "base_url": "https://api.deepseek.com",
                    "key_env": "ELREN_PROVIDER_DEEPSEEK", "asset_hosts": []},
        "offering": {
            "name": "DeepSeek Flash", "upstream_model": "deepseek-flash",
            "operation": "text.generate", "adapter": "openai_chat",
            "parameters": {
                "max_tokens": {"type": "integer", "min": 1, "max": 32768, "default": 4096},
                "reasoning_effort": {"type": "string", "enum": ["none", "low", "high", "max"], "default": "none"},
            },
            "config": {"max_assets": 0, "submit_path": "/chat/completions",
                       "token_usage": "deepseek", "display_tags": ["文本创作", "对话"],
                       "display_description": "用于文案、脚本、角色与场景提取。"},
        },
        "reference_price": {
            "currency": "CNY", "fx": "1",
            "source": "https://api-docs.deepseek.com/zh-cn/quick_start/pricing/ ; 2026-09-22 核对。人民币/百万Token，零加价。北京时间周一至周五09:00–12:00、14:00–18:00为高峰，其余空闲。平台按上游 created 时间判定时段；缺失时间则待核算。成本为按公开价计算，非供应商账单。",
            "components": [
                {"meter": "input_tokens", "unit_size": "1000000", "unit_price": "2", "off_peak_unit_price": "1", "time_rule": "deepseek_cn_peak_v1"},
                {"meter": "cache_read_tokens", "unit_size": "1000000", "unit_price": "0.04", "off_peak_unit_price": "0.02", "time_rule": "deepseek_cn_peak_v1"},
                {"meter": "output_tokens", "unit_size": "1000000", "unit_price": "8", "off_peak_unit_price": "4", "time_rule": "deepseek_cn_peak_v1"},
            ],
        },
    }]
