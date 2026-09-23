"""Publish user-authorized official Flash tariffs without changing historical prices."""
from copy import deepcopy
import time
from sqlalchemy import select
from .models import Offering, Channel, Price, Audit
from .deepseek import deepseek_presets
from .channel_credentials import resolve_channel_secret
from .pricing import current_price, validate_price


def configure_deepseek_prices(db, actor):
    if actor.role != 'admin' or not actor.active:
        raise ValueError('需要有效管理员')
    preset = deepseek_presets()[0]
    models = list(db.scalars(select(Offering).where(Offering.upstream_model == 'deepseek-flash').with_for_update()))
    if len(models) != 1:
        raise ValueError('需要唯一的 DeepSeek Flash 模型配置')
    model = models[0]
    channel = db.get(Channel, model.channel_id)
    if channel.base_url.rstrip('/') != 'https://api.deepseek.com' or not channel.active:
        raise ValueError('官方价格仅用于已启用的 DeepSeek 官方渠道')
    if model.adapter != 'openai_chat' or model.config.get('token_usage') != 'deepseek':
        raise ValueError('DeepSeek 用量适配尚未配置')
    if not resolve_channel_secret(db, channel):
        raise ValueError('请先在渠道页保存 API Key')
    result = []
    for kind in ('cost', 'sale'):
        values = dict(deepcopy(preset['reference_price']), kind=kind, display_currency='CNY', markup='0')
        validate_price(values)
        current = current_price(db, model.id, kind)
        if current and all(getattr(current, key) == value for key, value in values.items()):
            result.append({'kind': kind, 'id': current.id, 'changed': False})
            continue
        # Only reuse the initial, unpublished official draft; never rewrite published history.
        draft = next((p for p in db.scalars(select(Price).where(Price.offering_id == model.id,
            Price.kind == kind, Price.published_at.is_(None)))
            if '2026-09-22 高峰价草稿' in p.source), None)
        before = {'components': deepcopy(draft.components), 'source': draft.source} if draft else None
        price = draft or Price(offering_id=model.id)
        for key, value in values.items():
            setattr(price, key, value)
        price.published_at = time.time()
        if not draft:
            db.add(price)
        db.flush()
        db.add(Audit(actor_id=actor.id, action='deepseek.price.publish', target=price.id,
                     details={'kind': kind, 'before': before, 'after': values, 'model_id': model.id}))
        result.append({'kind': kind, 'id': price.id, 'changed': True})
    if not model.active:
        model.active = True
        db.add(Audit(actor_id=actor.id, action='model.activate', target=model.id,
                     details={'reason': '官方峰谷成本及售价已配置，零加价'}))
    db.commit()
    return {'model_id': model.id, 'active': model.active, 'prices': result}
