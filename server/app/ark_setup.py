"""Install the approved three-model Ark setup without credentials or generation calls."""
import time
from copy import deepcopy
from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy import select

from .ark import ark_presets, PRICE_SOURCE
from .models import Channel, Offering, Price, Audit
from .services import validate_offering
from .pricing import validate_price

MINI_PROMOTION_END = datetime(2026, 10, 7, 14, tzinfo=ZoneInfo('Asia/Shanghai')).timestamp()
SETUP_VERSION = 'ark-three-chains-2026-09-14'


def configure_ark(db, actor):
    if actor.role != 'admin' or not actor.active:
        raise ValueError('需要有效的管理员账号')
    result = []
    for preset in ark_presets():
        existing = next((model for model in db.scalars(select(Offering))
                         if model.config.get('preset_id') == preset['id']), None)
        if existing:
            # Existing live configuration may contain account-specific choices.
            result.append({'name': existing.name, 'id': existing.id, 'created': False, 'active': existing.active})
            continue
        channel_data = preset['channel']
        channel = db.scalar(select(Channel).where(Channel.base_url == channel_data['base_url'],
                                                  Channel.key_env == channel_data['key_env']))
        if channel is None:
            channel = Channel(**channel_data, concurrency=2)
            db.add(channel)
            db.flush()
        values = deepcopy(preset['offering'])
        validate_offering(values)
        values['config'].update(preset_id=preset['id'], setup_version=SETUP_VERSION)
        model = Offering(**values, channel_id=channel.id, active=True)
        db.add(model)
        db.flush()
        now = time.time()
        schedules = [(now, deepcopy(preset['reference_price']))]
        if preset['id'] == 'seedance-2-0-mini-frames' and now < MINI_PROMOTION_END:
            schedules[0][1]['components'][0]['unit_price'] = '9.2'
            schedules[0][1]['source'] = PRICE_SOURCE + ' ; Mini 4折，2026-10-07 14:00 Asia/Shanghai 到期'
            schedules.append((MINI_PROMOTION_END, deepcopy(preset['reference_price'])))
        for published_at, reference in schedules:
            for kind in ('cost', 'sale'):
                values = dict(reference, kind=kind, display_currency='CNY', markup='0')
                validate_price(values)
                db.add(Price(**values, offering_id=model.id, published_at=published_at))
        db.add(Audit(actor_id=actor.id, action='ark.configure', target=model.id,
                     details={'setup_version': SETUP_VERSION, 'preset_id': preset['id'],
                              'markup': '0', 'generation_executed': False}))
        result.append({'name': model.name, 'id': model.id, 'created': True, 'active': True})
    db.commit()
    return result


def upgrade_seedream_specs(db, actor, dry_run=False):
    """Upgrade only the known Seedream preset; preserve channel, pricing and custom fields."""
    from .ark import seedream_parameters
    if actor.role != 'admin' or not actor.active:
        raise ValueError('需要有效的管理员账号')
    result = []
    for model in db.scalars(select(Offering).where(Offering.upstream_model == 'doubao-seedream-5-0-pro-260628')):
        if model.config.get('preset_id') != 'seedream-5-pro' or model.config.get('ark_image_billing') != 'seedream_5_pro_single':
            continue
        parameters = deepcopy(model.parameters)
        desired = seedream_parameters()
        if parameters.get('size', {}).get('enum') not in [['1K', '2K'], ['1K', '1.5K', '2K']]:
            raise ValueError('Seedream 已有自定义画质配置，需单独检查')
        if 'ratio' in parameters and parameters['ratio'] != desired['ratio']:
            raise ValueError('Seedream 已有自定义比例配置，需单独检查')
        desired['size'] = {**parameters['size'], 'enum': desired['size']['enum']}
        updated = {**parameters, **desired}
        changed = updated != parameters
        result.append({'id': model.id, 'name': model.name, 'changed': changed, 'before': parameters, 'after': updated})
        if changed and not dry_run:
            validate_offering({'config': model.config, 'adapter': model.adapter, 'operation': model.operation, 'parameters': updated})
            model.parameters = updated
            db.add(Audit(actor_id=actor.id, action='seedream.specs.upgrade', target=model.id,
                         details={'before': parameters, 'after': updated, 'price_changed': False}))
    if not dry_run:
        db.commit()
    return result
