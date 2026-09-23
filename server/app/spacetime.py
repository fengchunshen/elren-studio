"""GPT Image models routed through SpacetimeAI."""
from copy import deepcopy
from .image_specs import IMAGE_RATIOS, IMAGE_SIZES


def spacetime_parameters():
    return {
        "size": {"type": "string", "enum": list(IMAGE_SIZES), "default": "2K", "label": "画质"},
        "ratio": {"type": "string", "enum": list(IMAGE_RATIOS), "default": "auto", "label": "比例"},
        "quality": {"type": "string", "enum": ["auto"], "default": "auto", "hidden": True},
        "n": {"type": "integer", "enum": [1], "default": 1},
    }


def upgrade_spacetime_specs(db, actor, dry_run=False):
    """Apply the user-authorized specs to recognized offerings, without repricing."""
    from sqlalchemy import select
    from .models import Offering, Channel, Audit
    from .services import validate_offering
    if actor.role != 'admin' or not actor.active:
        raise ValueError('需要有效的管理员账号')
    presets = {p['id']: p for p in spacetime_presets()}
    result = []
    for model, channel in db.execute(select(Offering, Channel).join(Channel, Offering.channel_id == Channel.id)):
        preset = presets.get(model.config.get('preset_id'))
        if not preset or model.upstream_model != preset['offering']['upstream_model']:
            continue
        if (channel.base_url.rstrip('/') != 'https://spacetimeai.cc'
                or channel.key_env != 'ELREN_PROVIDER_SPACETIMEAI'
                or model.adapter != 'openai_image_edit'):
            continue
        before = {'parameters': deepcopy(model.parameters), 'config': deepcopy(model.config)}
        desired = spacetime_parameters()
        for key in ('size', 'ratio'):
            old = model.parameters.get(key)
            if old is not None and old != desired[key] and not (key == 'size' and old.get('enum') == ['auto']):
                raise ValueError(f'{model.name} 已有自定义 {key} 配置，需单独检查')
        parameters = {**model.parameters, 'size': desired['size'], 'ratio': desired['ratio']}
        config = {**model.config, 'image_size_mapping': 'gpt_image_tiers_v1',
                  'display_tags': [tag for tag in model.config.get('display_tags', []) if tag != '自动规格']}
        after = {'parameters': parameters, 'config': config}
        changed = before != after
        result.append({'id': model.id, 'name': model.name, 'changed': changed, 'before': before, 'after': after})
        if changed and not dry_run:
            validate_offering({**after, 'adapter': model.adapter, 'operation': model.operation})
            model.parameters, model.config = parameters, config
            db.add(Audit(actor_id=actor.id, action='spacetime.specs.upgrade', target=model.id,
                         details={'before': before, 'after': after, 'price_changed': False,
                                  'provider_size_acceptance': 'pending_user_test'}))
    if not dry_run:
        db.commit()
    return result


def spacetime_presets():
    base = {
        "sale_markup": "0",
        "channel": {
            "name": "SpacetimeAI",
            "base_url": "https://spacetimeai.cc",
            "key_env": "ELREN_PROVIDER_SPACETIMEAI",
            "asset_hosts": [],
        },
        "offering": {
            "name": "GPT Image 2.5",
            "upstream_model": "gpt-image-2.5-flare",
            "operation": "image.edit",
            "adapter": "openai_image_edit",
            "parameters": spacetime_parameters(),
            "config": {"accepted_media": ["image"], "max_assets": 4, "token_usage": "openai", "allow_text_generation": True,
                       "image_size_mapping": "gpt_image_tiers_v1", "http2": True, "user_agent": "curl/8.5.0"},
        },
        # Gateway credits are charged per image, not the raw OpenAI token cost.
        "reference_price": {
            "currency": "CNY", "fx": "1",
            "source": "https://spacetimeai.cc/usage ; 2026-09-15 elren 密钥实测：Flare 2 张共 0.402、Sunburst 1 张 0.201，按次(图片) 2K 档。仅开放自动规格、单张；充值口径 1 CNY=1 虚拟美元，零加价。不是 OpenAI 官方 Token 单价。",
            "components": [{"meter": "images", "unit_size": "1", "unit_price": "0.201"}],
        },
    }
    result = []
    for variant, tag, description in [
        ("flare", "快速生成", "适合日常创作，快速生成高质量图片。"),
        ("sunburst", "精细编辑", "适合参考图精修，注重修改准确性。"),
    ]:
        preset = deepcopy(base)
        preset.update(id=f"spacetime-gpt-image-2-5-{variant}",
                      name=f"GPT Image 2.5 {variant.title()} · SpacetimeAI",
                      source=f"https://developers.openai.com/api/docs/models/gpt-image-2.5-{variant}",
                      note=f"{tag}：{description} 支持文生图、参考图编辑。1K／1.5K／2K 与常用比例已开放供用户测试，渠道尺寸执行待验收，按张计费；统一返回 gpt-image-2-codex，版本映射差异保留在后台核对。")
        preset['offering'].update(name=f"GPT Image 2.5 {variant.title()}", upstream_model=f"gpt-image-2.5-{variant}")
        preset['offering']['config'].update(display_tags=[tag], display_description=description)
        result.append(preset)
    image2 = deepcopy(base)
    image2.update(id="spacetime-gpt-image-2", name="GPT Image 2 · SpacetimeAI",
                  source="https://developers.openai.com/api/docs/models/gpt-image-2",
                  note="通用图片生成与参考图编辑，已接入 1K／1.5K／2K 与常用比例、单张，渠道尺寸执行待用户验收。实扣与平台公示 Token 价不一致，需分别核对成本和售价后开放。")
    # Do not copy the 2.5 variants' per-image supplier cost onto this model.
    image2['reference_price'] = None
    image2['offering'].update(name="GPT Image 2", upstream_model="gpt-image-2")
    image2['offering']['config'].update(display_tags=["通用生图"],
                                       display_description="适合通用图片创作与参考图编辑。")
    result.append(image2)
    return result
