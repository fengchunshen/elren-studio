"""Ark presets and Seedream single-image billing, verified 2026-09-14."""
from copy import deepcopy

PRICE_SOURCE = "https://docs.volcengine.com/docs/82379/1544106?lang=zh"
IMAGE_PIXEL_THRESHOLD = 2_610_000

from .image_specs import IMAGE_RATIOS as SEEDREAM_RATIOS, IMAGE_SIZES as SEEDREAM_SIZES


def seedream_size(parameters):
    tier = parameters.get('size', '2K')
    ratio = parameters.get('ratio', 'auto')
    if tier not in SEEDREAM_SIZES or ratio not in SEEDREAM_RATIOS:
        raise ValueError('Seedream 画质或比例不在支持范围')
    if ratio == 'auto':
        return tier
    value = SEEDREAM_SIZES[tier][SEEDREAM_RATIOS.index(ratio) - 1]
    width, height = map(int, value.split('x'))
    if not 921600 <= width * height <= 4624220 or not 1 / 16 <= width / height <= 16:
        raise ValueError('Seedream 图片尺寸超出允许范围')
    return value


def seedream_parameters():
    return {
        'size': {'type': 'string', 'enum': list(SEEDREAM_SIZES), 'default': '2K', 'label': '画质'},
        'ratio': {'type': 'string', 'enum': SEEDREAM_RATIOS, 'default': 'auto', 'label': '比例'},
    }


def seedream_input_meters(payload):
    # Single-image generation: the first reference image is free per request.
    return {"billable_input_images": str(max(0, len(payload.get("asset_ids", [])) - 1))}


def seedream_estimate(payload):
    size = seedream_size(payload.get('parameters', {}))
    meters = seedream_input_meters(payload)
    small = size in {'1K', '1.5K'} if size in SEEDREAM_SIZES else int(size.split('x')[0]) * int(size.split('x')[1]) <= IMAGE_PIXEL_THRESHOLD
    meters.update(images_small='1' if small else '0', images_large='0' if small else '1')
    return meters


def ark_presets():
    channel = {"name": "火山方舟北京", "base_url": "https://ark.cn-beijing.volces.com",
               "key_env": "ELREN_PROVIDER_ARK", "asset_hosts": [
                   "ark-acg-cn-beijing.tos-cn-beijing.volces.com", "ark-project.tos-cn-beijing.volces.com",
                   "ark-content-generation-cn-beijing.tos-cn-beijing.volces.com"]}
    image = {
        "id": "seedream-5-pro", "name": "Seedream 5.0 Pro",
        "note": "文生图、最多十张参考图生成单图；1K/1.5K/2K、自适应与常用比例。按实际输出像素档位计费，首张输入图免费。",
        "source": "https://docs.volcengine.com/docs/82379/1541523?lang=zh", "channel": channel,
        "offering": {"name": "Seedream 5.0 Pro", "upstream_model": "doubao-seedream-5-0-pro-260628",
            "operation": "image.edit", "adapter": "json_async",
            "parameters": seedream_parameters(),
            "config": {"max_assets": 10, "image_inputs_only": True, "ark_image_billing": "seedream_5_pro_single",
                "submit_path": "/api/v3/images/generations",
                "body": {"model": "{{model}}", "prompt": "{{input.prompt}}", "image": "{{images}}",
                    "size": "{{input.parameters.size}}", "response_format": "url", "watermark": True},
                "output_path": "data", "output_url_field": "url",
                "usage_paths": {"output_tokens": "usage.output_tokens"}}},
        "reference_price": {"currency": "CNY", "fx": "1", "source": PRICE_SOURCE,
            "components": [
                {"meter": "images_small", "unit_size": "1", "unit_price": "0.30"},
                {"meter": "images_large", "unit_size": "1", "unit_price": "0.60"},
                {"meter": "billable_input_images", "unit_size": "1", "unit_price": "0.02"}]} }
    result = [image]
    # Use list prices in reusable drafts: promotional prices must be dated when published.
    for identity, name, upstream, rate in [
        ("seedance-2-0-mini-frames", "Seedance 2.0 Mini", "doubao-seedance-2-0-mini-260615", "23"),
        ("seedance-2-5-frames", "Seedance 2.5", "doubao-seedance-2-5-260628", "70"),
    ]:
        result.append({"id": identity, "name": name,
            "note": ("文生视频、首帧及首尾帧；480p/720p/1080p、4–15秒。" if identity == "seedance-2-5-frames" else "文生视频、首帧及首尾帧；720p、5/10/15秒。") + "按实际输出 Token 计费，价格草稿为无视频输入刊例价，不含限时折扣。",
            "source": "https://docs.volcengine.com/docs/82379/1520757?lang=zh", "channel": channel,
            "offering": {"name": name, "upstream_model": upstream, "operation": "video.generate", "adapter": "json_async",
                "parameters": {"resolution": {"type": "string", "enum": ["480p", "720p", "1080p"] if identity == "seedance-2-5-frames" else ["720p"], "default": "720p"},
                    "duration": {"type": "integer", "enum": list(range(4, 16)) if identity == "seedance-2-5-frames" else [5, 10, 15], "default": 5},
                    "ratio": {"type": "string", "enum": ["16:9", "4:3", "1:1", "3:4", "9:16", "21:9"] if identity == "seedance-2-5-frames" else ["16:9", "9:16", "1:1"], "default": "16:9"},
                    "generate_audio": {"type": "boolean", "default": True}},
                "config": {"max_assets": 2, "image_inputs_only": True, "content_from_frames": True,
                    "submit_path": "/api/v3/contents/generations/tasks",
                    "status_path": "/api/v3/contents/generations/tasks/{id}",
                    "body": {"model": "{{model}}", "content": "{{content}}",
                        "resolution": "{{input.parameters.resolution}}", "duration": "{{input.parameters.duration}}",
                        "ratio": "{{input.parameters.ratio}}", "generate_audio": "{{input.parameters.generate_audio}}", "watermark": True},
                    "request_id_path": "id", "status_field": "status", "success_values": ["succeeded"],
                    "failure_values": ["failed", "expired", "cancelled"], "output_path": "content.video_url",
                    "usage_paths": {"output_tokens": "usage.completion_tokens", "video_seconds": "duration"}}},
            "reference_price": {"currency": "CNY", "fx": "1", "source": PRICE_SOURCE,
                "components": [{"meter": "output_tokens", "unit_size": "1000000", "unit_price": rate}]}})
    return deepcopy(result)
