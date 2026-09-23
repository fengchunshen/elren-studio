from .video_edit import OPERATIONS as VIDEO_EDIT_OPERATIONS, validate_video_edit
import time
from sqlalchemy import select
from .models import Project, Offering, Channel, Asset, Entry, Usage, Attempt
from .provider_errors import provider_failure_message
from .task_recovery import recovery_mode, recovery_message
from .pricing import current_price, snapshot, calculate, fingerprint, decimal
from .security import fail


def owned(db, model, identity, user):
    item = db.get(model, identity)
    if item is None or item.user_id != user.id:
        fail("NOT_FOUND", "记录不存在", 404)
    return item


def validate_offering(data):
    config = data["config"]
    tags = config.get("display_tags", [])
    if not isinstance(tags, list) or len(tags) > 3 or any(not isinstance(tag, str) or not tag.strip() or len(tag) > 12 for tag in tags):
        raise ValueError("模型特点标签最多 3 个，每个为 1–12 字")
    description = config.get("display_description", "")
    if not isinstance(description, str) or len(description) > 100:
        raise ValueError("模型用途说明需为 100 字以内的文本")
    if "allow_text_generation" in config and (type(config["allow_text_generation"]) is not bool or data["adapter"] != "openai_image_edit"):
        raise ValueError("文生图回退仅用于图片编辑适配器")
    if "http2" in config and type(config["http2"]) is not bool:
        raise ValueError("HTTP/2 设置需为布尔值")
    if 'image_size_mapping' in config and (config['image_size_mapping'] != 'gpt_image_tiers_v1'
            or data['adapter'] not in {'openai_image', 'openai_image_edit'}):
        raise ValueError('GPT 图片尺寸映射需使用图片适配器')
    if "user_agent" in config and (not isinstance(config["user_agent"], str) or not config["user_agent"].isascii() or len(config["user_agent"]) > 128 or any(ord(char) < 32 or ord(char) == 127 for char in config["user_agent"])):
        raise ValueError("User-Agent 需为 128 字以内的单行 ASCII 文本")
    if config.get("auth_header", "Authorization") not in {"Authorization", "X-API-Key", "xi-api-key"}:
        raise ValueError("不支持的认证请求头")
    if config.get("auth_scheme", "bearer") not in {"bearer", "raw"}:
        raise ValueError("不支持的认证方式")
    if "accepted_media" in config and (not isinstance(config["accepted_media"], list) or any(item not in {"image", "video", "audio", "model"} for item in config["accepted_media"])):
        raise ValueError("参考类型只支持 image/video/audio/model")
    if "audio_purpose" in config and (data["operation"] != "audio.generate" or config["audio_purpose"] not in {"speech", "music", "sound"}):
        raise ValueError("音频用途需为 speech/music/sound")
    if "max_assets" in config and (type(config["max_assets"]) is not int or not 0 <= config["max_assets"] <= 50):
        raise ValueError("参考素材上限需为 0–50")
    limits = config.get("reference_limits", {})
    if not isinstance(limits, dict) or any(key not in {"image", "video", "audio", "model"} or type(value) is not int or not 0 <= value <= 50 for key, value in limits.items()):
        raise ValueError("分类参考上限格式不正确")
    if "video_edit_contract" in config:
        if type(config["video_edit_contract"]) is not int or config["video_edit_contract"] != 1 or data["operation"] not in VIDEO_EDIT_OPERATIONS or data["adapter"] not in {"json_async", "http_media"}:
            raise ValueError("视频专用编辑需使用版本 1 合约与可配置适配器")
        # Require an explicit mapping; merely declaring a capability must not drop its data.
        import json
        body = json.dumps(config.get("body", {}))
        field = 'target' if data['operation'] in {'video.replace', 'video.remove'} else 'shots' if data['operation'] == 'video.retake' else 'extension'
        if '{{input.video_edit}}' not in body and '{{input.video_edit.' + field + '}}' not in body:
            raise ValueError("渠道请求尚未映射 video_edit 编辑数据")
    expected = {"openai_chat": "text.generate", "openai_image": "image.generate", "openai_image_edit": "image.edit", "minimax_h3": "video.generate"}
    if data["adapter"] in expected and data["operation"] != expected[data["adapter"]]:
        raise ValueError("适配器与模型能力不匹配")
    if data["adapter"] in {"json_async", "http_media"}:
        config = data["config"]
        if not config.get("submit_path") or not config.get("body") or not config.get("output_path"):
            raise ValueError("异步适配需填写 submit_path、body 和 output_path")
        for key in ("submit_path", "status_path", "result_path"):
            path = config.get(key)
            if path and (not path.startswith("/") or path.startswith("//") or ".." in path or "?" in path or "#" in path):
                raise ValueError("适配路径必须是渠道下的绝对路径")
    for name, spec in data["parameters"].items():
        if not isinstance(spec, dict) or spec.get("type") not in {"string", "integer", "number", "boolean"}:
            raise ValueError(f"参数 {name} 需要明确类型")
        if name in {"model", "api_key", "base_url", "tools", "stream"}:
            raise ValueError("不可覆盖平台控制参数")


def validate_task(db, user, payload):
    project = owned(db, Project, payload["project_id"], user)
    if project.archived:
        fail("PROJECT_ARCHIVED", "项目已归档")
    offering = db.get(Offering, payload["model_offering_id"])
    if not offering or not offering.active or offering.operation != payload["operation"]:
        fail("MODEL_UNAVAILABLE", "模型暂不可用")
    channel = db.get(Channel, offering.channel_id)
    if not channel or not channel.active:
        fail("MODEL_UNAVAILABLE", "模型渠道暂不可用")
    sale, cost = current_price(db, offering.id, "sale"), current_price(db, offering.id, "cost")
    if not sale or not cost:
        fail("PRICE_MISSING", "模型价格尚未配置完整")
    value = payload["input"]
    if set(value) - {"prompt", "messages", "asset_ids", "mask_asset_id", "parameters", "references", "shots", "video_edit"}:
        raise ValueError("输入包含不支持的字段")
    if offering.operation in VIDEO_EDIT_OPERATIONS:
        if offering.config.get("video_edit_contract") != 1 or not value.get("video_edit"):
            raise ValueError("当前模型尚未接入视频专用编辑协议")
    elif "video_edit" in value:
        raise ValueError("此操作不接受视频编辑数据")
    if value.get("shots"):
        if not offering.config.get("supports_shots") or not isinstance(value["shots"], list) or len(value["shots"]) > 20:
            raise ValueError("当前模型未开放该多镜头输入")
        for shot in value["shots"]:
            if not isinstance(shot, dict) or set(shot) != {"prompt", "duration"} or not isinstance(shot["prompt"], str) or not shot["prompt"].strip() or decimal(shot["duration"]) <= 0:
                raise ValueError("每个镜头需要提示词和正数时长")
    parameters = dict(value.get("parameters", {}))
    if set(parameters) - set(offering.parameters):
        raise ValueError("请求包含模型未开放的参数")
    for name, spec in offering.parameters.items():
        if name not in parameters and "default" in spec:
            parameters[name] = spec["default"]
        if name not in parameters:
            if spec.get("required"):
                raise ValueError(f"缺少参数 {name}")
            continue
        item = parameters[name]
        valid = {"string": isinstance(item, str), "integer": type(item) is int,
                 "number": type(item) in (int, float), "boolean": type(item) is bool}
        if not valid.get(spec["type"]):
            raise ValueError(f"参数 {name} 类型不正确")
        if "enum" in spec and item not in spec["enum"]:
            raise ValueError(f"参数 {name} 不在允许范围")
        if spec["type"] in {"integer", "number"}:
            numeric = decimal(item)
            if numeric < decimal(spec.get("min", 0)) or numeric > decimal(spec.get("max", 1000000)):
                raise ValueError(f"参数 {name} 超出范围")
    if offering.config.get('ark_image_billing') == 'seedream_5_pro_single':
        from .ark import seedream_size
        seedream_size(parameters)
    if offering.config.get('image_size_mapping') == 'gpt_image_tiers_v1':
        from .image_specs import gpt_image_size
        gpt_image_size(parameters)
    value["parameters"] = parameters
    asset_ids = value.get("asset_ids", [])
    if value.get("mask_asset_id") and offering.adapter != "openai_image_edit" and not offering.config.get("supports_mask"):
        raise ValueError("当前模型尚未开放蒙版输入，请选择支持蒙版的图片编辑模型")
    max_assets = min(50, int(offering.config.get("max_assets", 20)))
    if not isinstance(asset_ids, list) or len(asset_ids) > max_assets:
        raise ValueError(f"最多支持 {max_assets} 个参考素材")
    references = value.get("references", [])
    if not isinstance(references, list) or len(references) > max_assets:
        raise ValueError("参考素材角色格式不正确")
    for reference in references:
        if not isinstance(reference, dict) or set(reference) != {"asset_id", "role"} or reference.get("asset_id") not in asset_ids or reference.get("role") not in {"reference", "first_frame", "last_frame", "audio", "source", "target_frame", "replacement"}:
            raise ValueError("参考素材角色或所属关系不正确")
    if any(item["role"] in {"target_frame", "replacement"} for item in references) and not value.get("video_edit"):
        raise ValueError("对象选区素材只能用于视频专用编辑")
    media_counts = {}
    asset_kinds = {}
    for asset_id in asset_ids + ([value["mask_asset_id"]] if value.get("mask_asset_id") else []):
        asset = owned(db, Asset, asset_id, user)
        if asset.project_id != project.id:
            raise ValueError("素材不属于当前项目")
        kind = asset.mime.split("/")[0]
        asset_kinds[asset_id] = kind
        media_counts[kind] = media_counts.get(kind, 0) + 1
        accepted = offering.config.get("accepted_media", ["audio"] if offering.operation == "audio.generate" else ["image"])
        if asset_id != value.get("mask_asset_id") and kind not in accepted:
            raise ValueError(f"当前模型未开放 {kind} 参考输入")
    if value.get("video_edit"):
        if set(asset_ids) != {item["asset_id"] for item in references}:
            raise ValueError("视频编辑有未指定用途的素材")
        validate_video_edit(offering.operation, value["video_edit"], references, asset_kinds)
    for kind, count in media_counts.items():
        if count > offering.config.get("reference_limits", {}).get(kind, max_assets):
            raise ValueError(f"{kind} 参考素材超过模型上限")
    if offering.operation == "video.avatar" and not all(media_counts.get(kind) for kind in ["image", "audio"]):
        raise ValueError("数字人视频需要图片和音频")
    for asset_id in asset_ids:
        asset = db.get(Asset, asset_id)
        if offering.config.get("image_inputs_only") and not asset.mime.startswith("image/"):
            raise ValueError("该模型预设只接受图片参考")
        if offering.adapter == "minimax_h3" and (not asset.mime.startswith("image/") or asset.size > 30 * 1024 * 1024):
            raise ValueError("当前 MiniMax 接入支持 30 MB 以内的首尾帧图片")
    if offering.adapter == "minimax_h3" and len(asset_ids) > 2:
        raise ValueError("当前 MiniMax 接入支持文生视频和首尾帧；多模态参考待独立配置计费")
    if len(asset_ids) < offering.config.get("min_assets", 0) or len(asset_ids) > max_assets:
        raise ValueError("参考素材数量不符合模型要求")
    if offering.operation == "text.generate":
        messages = value.get("messages")
        if not isinstance(messages, list) or not 1 <= len(messages) <= 200:
            raise ValueError("文字请求需要消息列表")
        for message in messages:
            if not isinstance(message, dict):
                raise ValueError("消息必须是对象")
            if set(message) - {"role", "content"} or message.get("role") not in {"system", "user", "assistant"}:
                raise ValueError("消息格式不支持")
            content = message.get("content")
            if isinstance(content, list):
                for part in content:
                    if not isinstance(part, dict):
                        raise ValueError("消息内容必须是对象")
                    if part.get("type") == "text" and isinstance(part.get("text"), str):
                        continue
                    if part.get("type") == "image_url" and isinstance(part.get("image_url", {}).get("url"), str) and part["image_url"]["url"].startswith(("data:image/png;base64,", "data:image/jpeg;base64,", "data:image/webp;base64,")):
                        continue
                    raise ValueError("文字请求的图片需使用内嵌图片数据")
            elif not isinstance(content, str):
                raise ValueError("消息内容格式不支持")
    elif not isinstance(value.get("prompt"), str) or not value["prompt"].strip():
        raise ValueError("请输入提示词")
    # Validate pricing conditions even when actual token usage is not yet available.
    for price in (sale, cost):
        for component in price.components:
            if any(parameters.get(k) != v for k, v in component.get("conditions", {}).items()):
                raise ValueError("参数与计价规格不匹配")
    return offering, sale


def offering_snapshot(offering):
    return {key: getattr(offering, key) for key in ("id", "name", "channel_id", "upstream_model", "operation", "adapter", "config", "parameters")}


def record_usage(db, task, attempt, meters, raw, source="provider_response", billable=True):
    billing_at = (attempt.response or {}).get('created')
    evidence_data = {"raw": raw, "meters": meters, "source": source}
    if any(c.get('time_rule') for price in (attempt.cost_snapshot, task.sale_snapshot) for c in price['components']):
        evidence_data['billing_at'] = billing_at
    evidence = fingerprint(evidence_data)
    if not db.scalar(select(Usage).where(Usage.attempt_id == attempt.id, Usage.evidence_hash == evidence)):
        db.add(Usage(attempt_id=attempt.id, evidence_hash=evidence, source=source, raw=raw, meters=meters))
    for kind, price in (("cost", attempt.cost_snapshot), ("sale", task.sale_snapshot)):
        if kind == "sale" and (not billable or task.test):
            task.billing_status = "not_billable"
            continue
        result = calculate(price, meters, task.payload["input"].get("parameters", {}), billing_at=billing_at)
        if result is None:
            continue
        entry_key = f"{task.id}:{kind}:original"
        if db.scalar(select(Entry).where(Entry.entry_key == entry_key)):
            continue
        db.add(Entry(entry_key=entry_key, task_id=task.id, user_id=task.user_id, project_id=task.project_id,
                     kind=kind, currency=price["currency"], display_currency=price["display_currency"],
                     original_amount=result["original_amount"], amount=result["amount"],
                     details={"price": price, "items": result["items"], "evidence_hash": evidence}))
        if kind == "sale":
            task.billing_status = "recorded"
        else:
            task.cost_status = "calculated"


def task_dict(db, task, include_admin=False):
    error = task.error
    recovery = None
    if task.status == "reconciling":
        attempt = db.scalar(select(Attempt).where(Attempt.task_id == task.id))
        mode = recovery_mode(task.offering_snapshot, attempt)
        recovery = {"mode": mode, "automatic": mode != "manual"}
        # Include old records without rewriting their saved provider evidence.
        error = recovery_message(mode, attempt.response if attempt else None)
    # Older failures keep their original evidence; translate them when read too.
    if task.status == "failed" and error and (error.startswith("上游请求失败（HTTP ") or error == "上游未返回有效结果"):
        attempt = db.scalar(select(Attempt).where(Attempt.task_id == task.id))
        if attempt:
            error = provider_failure_message(attempt.response, error)
    entries = list(db.scalars(select(Entry).where(Entry.task_id == task.id)))
    amount = sum((entry.amount for entry in entries if entry.kind == "sale"), decimal(0))
    public_items = []
    for entry in entries:
        if entry.kind != "sale":
            continue
        rate = decimal(entry.details.get("price", {}).get("fx", "1"))
        for item in entry.details.get("items", []):
            public_items.append({**item, "unit_price": str(decimal(item["unit_price"]) * rate),
                                 "amount": str(decimal(item["amount"]) * rate), "currency": entry.display_currency})
    result = {"id": task.id, "project_id": task.project_id, "model_offering_id": task.offering_id,
              "prompt": task.payload["input"].get("prompt", ""),
              "model_name": task.offering_snapshot["name"], "operation": task.payload["operation"],
              "source": task.payload.get("source", {}), "status": task.status, "result": task.result,
              "recovery": recovery,
              "error": error, "created_at": task.created_at, "cancel_requested": task.cancel_requested,
              "billing": {"status": task.billing_status, "amount": str(amount) if task.billing_status != "pending" else None,
                          "currency": task.sale_snapshot["display_currency"], "price_version_id": task.sale_snapshot["id"],
                          "items": public_items}}
    if include_admin:
        result.pop("prompt", None)
        result["result"] = {}
        result.update(user_id=task.user_id, cost_status=task.cost_status,
                      cost_amount=str(sum((entry.amount for entry in entries if entry.kind == "cost"), decimal(0))),
                      entries=[{"id": entry.id, "kind": entry.kind, "amount": str(entry.amount), "reason": entry.reason} for entry in entries])
    return result
