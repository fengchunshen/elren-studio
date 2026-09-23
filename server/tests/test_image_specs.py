from copy import deepcopy

import pytest
from sqlalchemy import select

from app.image_specs import IMAGE_SIZES, IMAGE_RATIOS, gpt_image_size
from app.models import Offering, User, Price
from app.spacetime import spacetime_parameters, upgrade_spacetime_specs


@pytest.mark.parametrize('tier', IMAGE_SIZES)
@pytest.mark.parametrize('ratio', IMAGE_RATIOS[1:])
def test_fixed_gpt_sizes_share_seedream_mapping_and_obey_constraints(tier, ratio):
    from app.ark import seedream_size
    params = {'size': tier, 'ratio': ratio}
    size = gpt_image_size(params)
    assert size == seedream_size(params)
    width, height = map(int, size.split('x'))
    assert width % 16 == height % 16 == 0
    assert max(width, height) <= 3840
    assert 655360 <= width * height <= 8294400
    assert max(width, height) <= 3 * min(width, height)


@pytest.mark.parametrize('tier,edge', [('1K',1024), ('1.5K',1536), ('2K',2048)])
@pytest.mark.parametrize('reference', [None, (1600,900), (900,1600), (9000,1), (1,9000)])
def test_adaptive_gpt_preserves_pixel_tier_and_reference_orientation(tier, edge, reference):
    width, height = map(int, gpt_image_size({'size': tier}, reference).split('x'))
    assert abs(width * height / edge**2 - 1) < .03
    assert width % 16 == height % 16 == 0
    assert max(width,height) <= 3 * min(width,height)
    if reference:
        assert (width > height) == (reference[0] > reference[1])
    else:
        assert width == height == edge


@pytest.mark.parametrize('params', [{'size':'4K'}, {'size':'auto'}, {'ratio':'8:1'}])
def test_gpt_invalid_specs_are_rejected(params):
    with pytest.raises(ValueError):
        gpt_image_size(params)


def test_upgrade_preserves_prices_and_activation_and_is_idempotent(env):
    client, factory, ids = env
    from app.spacetime import spacetime_presets
    model_ids = [client.post('/api/v1/admin/model-presets/' + preset['id']).json()['model_id'] for preset in spacetime_presets()]
    with factory() as db:
        for model_id in model_ids:
            model = db.get(Offering, model_id)
            model.parameters = {'size': {'type':'string','enum':['auto'],'default':'auto','hidden':True},
                                'quality': {'type':'string','enum':['auto'],'default':'auto','hidden':True},
                                'n': {'type':'integer','enum':[1],'default':1}}
            model.config = {**model.config, 'display_tags':['自动规格', '快速生成']}
            model.active = True
        db.commit()
        prices = [(p.id,deepcopy(p.components),p.published_at) for p in db.scalars(select(Price))]
        actor = db.get(User, ids['admin'])
        preview = upgrade_spacetime_specs(db, actor, dry_run=True)
        assert len(preview) == 3 and all(item['changed'] for item in preview)
        assert db.get(Offering,model_ids[0]).parameters['size']['enum'] == ['auto']
        upgrade_spacetime_specs(db, actor)
        for model_id in model_ids:
            model = db.get(Offering,model_id)
            assert model.active and model.parameters == spacetime_parameters()
            assert model.config['display_tags'] == ['快速生成']
        assert not any(item['changed'] for item in upgrade_spacetime_specs(db, actor))
        assert prices == [(p.id,p.components,p.published_at) for p in db.scalars(select(Price))]
