import hashlib
import json
import time
from datetime import datetime
from zoneinfo import ZoneInfo
from decimal import Decimal, InvalidOperation, ROUND_CEILING, localcontext
from sqlalchemy import select
from .models import Price

METERS = {"input_tokens", "output_tokens", "cache_read_tokens", "cache_write_tokens", "image_tokens", "images", "images_small", "images_large", "billable_input_images", "megapixels", "video_seconds", "audio_seconds", "input_audio_seconds", "input_video_seconds", "characters", "requests"}


def decimal(value):
    try:
        result = Decimal(str(value))
    except (InvalidOperation, ValueError):
        raise ValueError("金额或用量格式不正确")
    if not result.is_finite() or abs(result) >= Decimal("100000000000"):
        raise ValueError("金额或用量超出范围")
    return result


def fingerprint(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()


def validate_price(data):
    if data["currency"] not in {"CNY", "USD", "EUR"} or data["display_currency"] != "CNY":
        raise ValueError("支持 CNY/USD/EUR 原币种，展示币种为 CNY")
    if decimal(data["fx"]) <= 0 or decimal(data["markup"]) < 0:
        raise ValueError("汇率必须为正，加价比例不能为负")
    if data["currency"] == data["display_currency"] and decimal(data["fx"]) != 1:
        raise ValueError("相同币种汇率必须为 1")
    if data["kind"] == "cost" and decimal(data["markup"]) != 0:
        raise ValueError("成本价不应用平台加价")
    if not data["components"]:
        raise ValueError("至少配置一个计费组件")
    names = set()
    for component in data["components"]:
        if set(component) - {"meter", "unit_size", "unit_price", "rounding_step", "conditions", "time_rule", "off_peak_unit_price"}:
            raise ValueError("未知计费组件字段")
        meter = component.get("meter")
        if meter not in METERS or meter in names:
            raise ValueError("计量项不支持或重复；不同规格请建立独立模型条目")
        names.add(meter)
        if decimal(component.get("unit_size", 0)) <= 0 or decimal(component.get("unit_price", -1)) < 0:
            raise ValueError("单位大小必须为正，单价不能为负")
        if "rounding_step" in component and decimal(component["rounding_step"]) <= 0:
            raise ValueError("用量取整步长必须为正")
        if 'time_rule' in component or 'off_peak_unit_price' in component:
            if component.get('time_rule') != 'deepseek_cn_peak_v1' or 'off_peak_unit_price' not in component:
                raise ValueError('分时价格需要完整的时段规则和空闲单价')
            if meter not in {'input_tokens', 'cache_read_tokens', 'output_tokens'} or data['currency'] != 'CNY':
                raise ValueError('DeepSeek 分时规则仅用于人民币 Token 价格')
            if decimal(component['off_peak_unit_price']) < 0:
                raise ValueError('空闲单价不能为负')


def snapshot(price):
    return {"id": price.id, "currency": price.currency, "display_currency": price.display_currency,
            "fx": price.fx, "markup": price.markup, "components": price.components,
            "source": price.source, "published_at": price.published_at, "rule_version": 1}


def current_price(db, offering_id, kind):
    return db.scalar(select(Price).where(Price.offering_id == offering_id, Price.kind == kind,
                     Price.published_at <= time.time()).order_by(Price.published_at.desc(), Price.id.desc()).limit(1))


def deepseek_period(timestamp):
    if type(timestamp) not in (int, float) or not 0 < timestamp < 253402214400:
        return None
    local = datetime.fromtimestamp(timestamp, ZoneInfo('Asia/Shanghai'))
    minute = local.hour * 60 + local.minute
    return 'peak' if local.weekday() < 5 and (540 <= minute < 720 or 840 <= minute < 1080) else 'off_peak'


def calculate(price, meters, parameters=None, billing_at=None):
    """Missing is not zero. Sum only normalized, mutually exclusive meter quantities."""
    with localcontext() as context:
        context.prec = 40
        total, items = Decimal(0), []
        for component in price["components"]:
            if any((parameters or {}).get(k) != v for k, v in component.get("conditions", {}).items()):
                raise ValueError("参数与计费规格不一致")
            meter = component["meter"]
            if meters.get(meter) is None:
                return None
            quantity = decimal(meters[meter])
            if quantity < 0:
                raise ValueError("用量不能为负")
            step = component.get("rounding_step")
            if step:
                quantity = (quantity / decimal(step)).to_integral_value(rounding=ROUND_CEILING) * decimal(step)
            period = None
            rate = component['unit_price']
            if component.get('time_rule'):
                if component['time_rule'] != 'deepseek_cn_peak_v1':
                    raise ValueError('未知分时计费规则')
                period = deepseek_period(billing_at)
                if period is None:
                    return None  # No provider timestamp: keep pending, never guess from wall clock.
                if period == 'off_peak':
                    rate = component['off_peak_unit_price']
            unit = decimal(rate) * (1 + decimal(price["markup"]))
            amount = quantity / decimal(component["unit_size"]) * unit
            total += amount
            items.append({"meter": meter, "quantity": str(quantity), "unit_price": str(unit), "unit_size": component["unit_size"], "amount": str(amount)})
            if period:
                items[-1].update(time_rule=component['time_rule'], period=period, billing_at=billing_at,
                                 time_source='provider.created')
        converted = total * decimal(price["fx"])
        decimal(converted)
        return {"original_amount": total, "amount": converted, "items": items}
