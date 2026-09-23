"""Restricted provider adapters. Only administrators define routes and body templates."""
import base64
import os
import re
from urllib.parse import quote, urlsplit
import httpx
from .config import settings
from .assets import data_url
from .models import Asset
from .security import validate_remote_url


class ProviderPreflightError(ValueError):
    """The request was rejected locally before any provider HTTP request."""


def path_value(data, path, default=None):
    value = data
    for part in path.split(".") if path else []:
        try:
            value = value[int(part)] if isinstance(value, list) else value[part]
        except (KeyError, IndexError, ValueError, TypeError):
            return default
    return value


def template(value, variables):
    if isinstance(value, dict):
        result = {key: template(item, variables) for key, item in value.items()}
        return {key: item for key, item in result.items() if item is not None}
    if isinstance(value, list):
        return [template(item, variables) for item in value]
    if isinstance(value, str) and re.fullmatch(r"\{\{[a-zA-Z0-9_.]+\}\}", value):
        return path_value(variables, value[2:-2])
    return value


def sanitized(value, secret):
    if isinstance(value, dict):
        return {key: sanitized(item, secret) for key, item in value.items() if key.lower() not in {"authorization", "api_key", "apikey"}}
    if isinstance(value, list):
        return [sanitized(item, secret) for item in value]
    if isinstance(value, str) and secret:
        return value.replace(secret, "[redacted]")
    return value


def invoke(db, task, attempt, channel, polling=False, client=None):
    offering = task.offering_snapshot
    config, adapter = offering["config"], offering["adapter"]
    from .channel_credentials import resolve_channel_secret
    try:
        secret = resolve_channel_secret(db, channel)
    except ValueError as error:
        raise ProviderPreflightError(str(error)) from None
    if not secret:
        raise ProviderPreflightError("渠道凭据尚未配置")
    base = channel.base_url.rstrip("/")
    try:
        validate_remote_url(base)
    except (ValueError, OSError) as error:
        raise ProviderPreflightError(f"供应商连接检查失败：{error}") from error
    headers = {config.get("auth_header", "Authorization"): secret if config.get("auth_scheme") == "raw" else f"Bearer {secret}", "Accept": "application/json"}
    if config.get("user_agent"):
        headers["User-Agent"] = config["user_agent"]
    if config.get("binary_output"):
        headers["Accept"] = "audio/*,image/*,video/*,application/json"
    if config.get("dashscope_async") and not polling:
        headers["X-DashScope-Async"] = "enable"
    if config.get("supports_idempotency"):
        headers["Idempotency-Key"] = attempt.id
    payload = task.payload["input"]
    params = payload.get("parameters", {})
    if config.get('ark_image_billing') == 'seedream_5_pro_single':
        from .ark import seedream_size
        # Render from a copy; the task and quote retain the user's tier/ratio choices.
        payload = {**payload, 'parameters': {**params, 'size': seedream_size(params)}}
        params = payload['parameters']
    if config.get('image_size_mapping') == 'gpt_image_tiers_v1':
        from PIL import Image
        from .image_specs import gpt_image_size
        reference_size = None
        if params.get('ratio', 'auto') == 'auto' and payload.get('asset_ids'):
            asset = db.get(Asset, payload['asset_ids'][0])
            with Image.open(settings.asset_dir / asset.storage_key) as image:
                reference_size = image.size
        params = {key: value for key, value in params.items() if key != 'ratio'} | {
            'size': gpt_image_size(params, reference_size)}
    # Some image models expose text generation and reference editing together.
    # A mask without a source must never fall through to text-only generation.
    if adapter == "openai_image_edit" and config.get("allow_text_generation") and not payload.get("asset_ids"):
        if payload.get("mask_asset_id"):
            raise ProviderPreflightError("蒙版编辑需要参考图片")
        adapter = "openai_image"
    kwargs = {}
    method = "POST"
    if polling:
        path = "/v2/query/video_generation/{id}" if adapter == "minimax_h3" else config.get("status_path", "")
        if not path or not attempt.remote_id:
            raise ValueError("缺少上游任务查询信息")
        endpoint = path.replace("{id}", quote(attempt.remote_id, safe=""))
        method = "GET"
    elif adapter == "openai_chat":
        endpoint = config.get("submit_path", "/v1/chat/completions")
        kwargs["json"] = {"model": offering["upstream_model"], "messages": payload["messages"], "stream": False, **params}
    elif adapter == "openai_image":
        endpoint = "/v1/images/generations"
        normalized = {**params}
        if "count" in normalized:
            normalized["n"] = normalized.pop("count")
        kwargs["json"] = {"model": offering["upstream_model"], "prompt": payload["prompt"], **normalized}
    elif adapter == "openai_image_edit":
        endpoint = "/v1/images/edits"
        assets = [db.get(Asset, identity) for identity in payload.get("asset_ids", [])]
        if not assets:
            raise ValueError("图片编辑需要参考图片")
        kwargs["data"] = {"model": offering["upstream_model"], "prompt": payload["prompt"], **{k: str(v) for k, v in params.items()}}
        kwargs["files"] = [("image[]" if len(assets) > 1 else "image", (asset.name, (settings.asset_dir / asset.storage_key).read_bytes(), asset.mime)) for asset in assets]
        if payload.get("mask_asset_id"):
            asset = db.get(Asset, payload["mask_asset_id"])
            kwargs["files"].append(("mask", (asset.name, (settings.asset_dir / asset.storage_key).read_bytes(), asset.mime)))
    elif adapter == "minimax_h3":
        endpoint = "/v2/video_generation"
        content = [{"type": "text", "text": payload["prompt"]}]
        for index, identity in enumerate(payload.get("asset_ids", [])):
            asset = db.get(Asset, identity)
            content.append({"type": "image_url", "image_url": {"url": data_url(asset)}, "role": "first_frame" if index == 0 else "last_frame"})
        kwargs["json"] = {"model": offering["upstream_model"], "content": content, **params}
    else:
        endpoint = config["submit_path"]
        assets = [db.get(Asset, identity) for identity in payload.get("asset_ids", [])]
        roles = {item["asset_id"]: item["role"] for item in payload.get("references", [])}
        variables = {"model": offering["upstream_model"], "input": payload,
                     "assets": [{"data_url": data_url(asset), "mime": asset.mime, "role": roles.get(asset.id, "reference")} for asset in assets]}
        if payload.get("mask_asset_id"):
            variables["mask"] = data_url(db.get(Asset, payload["mask_asset_id"]))
        for category, key in [("image", "images"), ("video", "videos"), ("audio", "audios"), ("model", "models")]:
            variables[key] = [data_url(asset) for asset in assets if asset.mime.startswith(category + "/")] or None
        if config.get("content_from_references"):
            variables["content"] = [{"type": "text", "text": payload["prompt"]}] + [
                {"type": asset.mime.split("/")[0] + "_url", asset.mime.split("/")[0] + "_url": {"url": data_url(asset)}, "role": roles.get(asset.id, "reference")}
                for asset in assets]
        if config.get("content_from_frames"):
            variables["content"] = [{"type": "text", "text": payload["prompt"]}] + [
                {"type": "image_url", "image_url": {"url": data_url(asset)}, "role": "first_frame" if index == 0 else "last_frame"}
                for index, asset in enumerate(assets)]
        kwargs["json"] = template(config["body"], variables)
        # Seedance frame-conditioned output inherits the first image's ratio.
        # Keep the original task/quote parameters intact for audit and text-only runs.
        if config.get("content_from_frames") and assets and offering["upstream_model"].startswith("doubao-seedance-"):
            kwargs["json"].pop("ratio", None)
        kwargs["params"] = template(config.get("query", {}), variables)
        endpoint = re.sub(r"\{([a-zA-Z][a-zA-Z0-9_]*)\}", lambda match: quote(str(params[match.group(1)]), safe="") if match.group(1) in params else match.group(0), endpoint)
        if "{" in endpoint:
            raise ValueError("接口路径所需参数尚未填写")
        if adapter == "http_media" and config.get("request_format") == "multipart":
            kwargs["data"] = {key: str(value).lower() if isinstance(value, bool) else str(value) for key, value in kwargs.pop("json").items()}
            kwargs["files"] = [(config.get("file_field", "image"), (asset.name, (settings.asset_dir / asset.storage_key).read_bytes(), asset.mime)) for asset in assets]
    with httpx.Client(timeout=httpx.Timeout(180, connect=10, write=60, pool=10), http2=config.get("http2", False), follow_redirects=False, trust_env=False) if client is None else null_client(client) as transport:
        response = transport.request(method, base + endpoint, headers=headers, **kwargs)
    if len(response.content) > settings.max_upload_bytes * 2:
        raise ValueError("供应商响应超过大小限制")
    mime = response.headers.get("content-type", "").split(";")[0]
    if config.get("binary_output") and 200 <= response.status_code < 300 and mime.startswith(("audio/", "image/", "video/", "model/")):
        data = {"output": f"data:{mime};base64," + base64.b64encode(response.content).decode(), "usage": {}}
        for meter, header in config.get("usage_headers", {}).items():
            value = response.headers.get(header)
            if value is not None:
                data["usage"][meter] = value
        return response.status_code, data, response.headers.get("request-id") or response.headers.get("x-request-id")
    try:
        data = response.json()
        if not isinstance(data, dict):
            data = {"data": data}
    except ValueError:
        data = {}
    if polling and config.get("result_path") and str(path_value(data, config.get("status_field", "status"), "")).lower() in [str(item).lower() for item in config.get("success_values", ["completed", "succeeded"])]:
        endpoint = config["result_path"].replace("{id}", quote(attempt.remote_id, safe=""))
        with httpx.Client(timeout=45, follow_redirects=False, trust_env=False) if client is None else null_client(client) as transport:
            result_response = transport.get(base + endpoint, headers=headers)
        if result_response.status_code >= 400:
            return result_response.status_code, data, response.headers.get("x-request-id")
        data["result"] = result_response.json()
    return response.status_code, sanitized(data, secret), response.headers.get("x-request-id")


class null_client:
    def __init__(self, client):
        self.client = client
    def __enter__(self):
        return self.client
    def __exit__(self, *args):
        return False


def interpret(offering, response, polling=False):
    adapter, config = offering["adapter"], offering["config"]
    if config.get("error_code_path"):
        code = path_value(response, config["error_code_path"])
        if code is not None and code not in config.get("success_codes", [0]):
            return {"state": "failed", "outputs": []}
    if adapter == "minimax_h3":
        result = response.get("task", {})
        state = result.get("status", "running" if response.get("task_id") else "reconciling")
        if state in {"cancelled", "expired"}: state = "failed"
        if state == "queued": state = "running"
        if state not in {"running", "succeeded", "failed", "reconciling"}: state = "reconciling"
        output = path_value(result, "content.url")
        if state == "succeeded" and not output: state = "reconciling"
        return {"state": state, "remote_id": response.get("task_id"), "outputs": [output] if output else []}
    if adapter == "openai_chat":
        content = path_value(response, "choices.0.message.content")
        if isinstance(content, list):
            content = "\n".join(part.get("text", "") for part in content if isinstance(part, dict))
        return {"state": "succeeded" if isinstance(content, str) and content else "failed", "text": content or "", "outputs": []}
    if adapter.startswith("openai_image"):
        outputs = [item.get("url") or ("data:image/png;base64," + item["b64_json"] if item.get("b64_json") else None) for item in response.get("data", []) if isinstance(item, dict)]
        return {"state": "succeeded" if any(outputs) else "failed", "outputs": [item for item in outputs if item]}
    state = str(path_value(response, config.get("status_field", "status"), "")).lower()
    if state in [str(item).lower() for item in config.get("failure_values", ["failed", "error", "canceled"])]:
        return {"state": "failed", "outputs": []}
    outputs = path_value(response, config["output_path"])
    if outputs and (not config.get("status_path") or state in [str(item).lower() for item in config.get("success_values", ["completed", "succeeded", "success"]) ]):
        outputs = outputs if isinstance(outputs, list) else [outputs]
        field = config.get("output_url_field", "url")
        text = path_value(response, config.get("text_output_path", ""), "") if config.get("text_output_path") else ""
        return {"state": "succeeded", "text": text if isinstance(text, str) else "", "outputs": [item.get(field) if isinstance(item, dict) else item for item in outputs]}
    remote_id = path_value(response, config.get("request_id_path", "id"))
    return {"state": "running" if remote_id or polling else "reconciling", "remote_id": str(remote_id) if remote_id is not None else None, "outputs": []}


def normalized_usage(offering, response, output_assets=None, payload=None):
    """OpenAI-compatible usage: cached input is a subset, not an extra input total."""
    usage = response.get("usage") or {}
    meters = {}
    config = offering["config"]
    if offering["adapter"] == "openai_chat" or config.get("token_usage") == "openai":
        prompt = usage.get("prompt_tokens", usage.get("input_tokens"))
        output = usage.get("completion_tokens", usage.get("output_tokens"))
        cached = path_value(usage, "prompt_tokens_details.cached_tokens", path_value(usage, "input_tokens_details.cached_tokens", 0))
        if config.get("token_usage") == "deepseek":
            cached = usage.get("prompt_cache_hit_tokens", cached)
        if prompt is not None:
            if int(prompt) < int(cached or 0) or int(cached or 0) < 0:
                raise ValueError("供应商缓存用量与输入总量不一致")
            meters["input_tokens"] = str(int(prompt) - int(cached or 0))
            meters["cache_read_tokens"] = str(cached or 0)
        if output is not None:
            meters["output_tokens"] = str(output)
    for meter, path in config.get("usage_paths", {}).items():
        value = path_value(response, path)
        if value is not None:
            meters[meter] = str(value)
    for meter, divisor in config.get("usage_divisors", {}).items():
        if meter in meters:
            from .pricing import decimal
            if decimal(divisor) <= 0:
                raise ValueError("用量换算除数必须为正")
            meters[meter] = str(decimal(meters[meter]) / decimal(divisor))
    if offering["adapter"] == "minimax_h3":
        usage = path_value(response, "task.usage", {})
        if usage.get("output_seconds") is not None:
            meters["video_seconds"] = str(usage["output_seconds"])
    if output_assets is not None:
        if offering["operation"].startswith("image"):
            meters["images"] = str(len(output_assets))
            from PIL import Image
            from decimal import Decimal
            pixels = 0
            image_pixels = []
            for asset in output_assets:
                with Image.open(settings.asset_dir / asset.storage_key) as image:
                    pixels += image.width * image.height
                    image_pixels.append(image.width * image.height)
            meters["megapixels"] = str(Decimal(pixels) / 1000000)
            if config.get("ark_image_billing") == "seedream_5_pro_single":
                from .ark import IMAGE_PIXEL_THRESHOLD, seedream_input_meters
                meters["images_small"] = str(sum(size <= IMAGE_PIXEL_THRESHOLD for size in image_pixels))
                meters["images_large"] = str(sum(size > IMAGE_PIXEL_THRESHOLD for size in image_pixels))
                if payload is not None:
                    meters.update(seedream_input_meters(payload))
        meters["requests"] = "1"
    return meters, usage


def download_output(url, channel, client=None):
    if not isinstance(url, str):
        raise ValueError("输出素材格式不正确")
    if url.startswith("data:"):
        prefix, encoded = url.split(",", 1)
        mime = prefix.removeprefix("data:").split(";")[0]
        if ";base64" not in prefix:
            raise ValueError("输出素材编码不支持")
        return base64.b64decode(encoded, validate=True), mime
    allowed = [urlsplit(channel.base_url).hostname, *channel.asset_hosts]
    validate_remote_url(url, allowed)
    with httpx.Client(timeout=45, follow_redirects=False, trust_env=False) if client is None else null_client(client) as transport:
        with transport.stream("GET", url) as response:
            response.raise_for_status()
            chunks, length = [], 0
            for chunk in response.iter_bytes():
                length += len(chunk)
                if length > settings.max_upload_bytes:
                    raise ValueError("输出文件超过大小限制")
                chunks.append(chunk)
            return b"".join(chunks), response.headers.get("content-type", "").split(";")[0]
