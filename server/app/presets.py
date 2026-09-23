"""Reviewable provider presets; provenance is explicit, never auto-enable or publish."""
from copy import deepcopy
from .creative_presets import creative_presets
from .ark import ark_presets
from .spacetime import spacetime_presets
from .deepseek import deepseek_presets

MINIMAX_PRICE_SOURCE = "https://platform.minimaxi.com/docs/guides/pricing-paygo"


def presets():
    result = []
    for model, resolution, price in [("MiniMax-H3", "768P", "0.50"), ("MiniMax-H3", "2K", "0.80"),
                                      ("MiniMax-H3-Max", "480P", "0.33"), ("MiniMax-H3-Max", "768P", "0.50")]:
        result.append({
            "id": f"{model.lower()}-{resolution.lower()}", "name": f"{model} · {resolution}",
            "source": "https://platform.minimaxi.com/docs/api-reference/video-generation-v2-create",
            "note": "文生视频、首尾帧。仅开放最多两张图片；多模态参考需单独适配输入计费。参考价为中国站公开刊例价。",
            "channel": {"name": "MiniMax 中国站", "base_url": "https://api.minimax.cn", "key_env": "ELREN_PROVIDER_MINIMAX", "asset_hosts": ["cdn.hailuoai.com", "filecdn.minimax.chat", "file.cdn.minimax.io"]},
            "offering": {"name": f"{model} · {resolution}", "upstream_model": model, "operation": "video.generate", "adapter": "minimax_h3",
                "parameters": {"resolution": {"type": "string", "enum": [resolution], "default": resolution},
                               "duration": {"type": "integer", "min": 5 if model.endswith("Max") else 4, "max": 15, "default": 5},
                               "ratio": {"type": "string", "enum": ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"], "default": "16:9"}},
                "config": {"max_assets": 2}},
            "reference_price": {"currency": "CNY", "fx": "1", "source": MINIMAX_PRICE_SOURCE,
                "components": [{"meter": "video_seconds", "unit_size": "1", "unit_price": price}]},
        })
    result.append({
        "id": "wan-2-7-first-frame", "name": "Wan 2.7 · 首帧生视频", "note": "公开 API 已核对。模型地区需与渠道及密钥一致；需另行填写该地区价格。",
        "source": "https://help.aliyun.com/en/model-studio/image-to-video-general-api-reference",
        "channel": {"name": "阿里云百炼北京", "base_url": "https://dashscope.aliyuncs.com", "key_env": "ELREN_PROVIDER_DASHSCOPE", "asset_hosts": ["dashscope-result-sh.oss-cn-shanghai.aliyuncs.com", "dashscope-result-sh.oss-accelerate.aliyuncs.com"]},
        "offering": {"name": "Wan 2.7 · 首帧生视频", "upstream_model": "wan2.7-i2v-2026-04-25", "operation": "video.generate", "adapter": "json_async",
            "parameters": {"resolution": {"type": "string", "enum": ["720P"], "default": "720P"}, "duration": {"type": "integer", "enum": [5, 10, 15], "default": 5}},
            "config": {"min_assets": 1, "max_assets": 1, "dashscope_async": True,
                "submit_path": "/api/v1/services/aigc/video-generation/video-synthesis", "status_path": "/api/v1/tasks/{id}",
                "body": {"model": "{{model}}", "input": {"prompt": "{{input.prompt}}", "media": [{"type": "first_frame", "url": "{{assets.0.data_url}}"}]}, "parameters": "{{input.parameters}}"},
                "request_id_path": "output.task_id", "status_field": "output.task_status", "success_values": ["SUCCEEDED"],
                "failure_values": ["FAILED", "CANCELED"], "output_path": "output.video_url", "usage_paths": {"video_seconds": "usage.output_video_duration"}}},
        "reference_price": None,
    })
    return deepcopy(result + ark_presets() + creative_presets() + spacetime_presets() + deepseek_presets())
