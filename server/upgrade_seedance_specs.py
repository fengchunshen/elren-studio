"""Update the known Seedance 2.5 offering specs without changing prices or credentials."""
from copy import deepcopy
from sqlalchemy import select
from app.ark import ark_presets
from app.db import Session
from app.models import Offering, Audit, User
from app.services import validate_offering


def upgrade(db):
    actor = db.scalar(select(User).where(User.role == 'admin', User.active == True))
    if actor is None:
        raise ValueError('需要有效的管理员账号')
    desired = next(p['offering']['parameters'] for p in ark_presets() if p['id'] == 'seedance-2-5-frames')
    changed = []
    for model in db.scalars(select(Offering).where(Offering.upstream_model == 'doubao-seedance-2-5-260628')):
        if model.config.get('preset_id') != 'seedance-2-5-frames':
            continue
        before = deepcopy(model.parameters)
        after = {**before, **{key: deepcopy(desired[key]) for key in ('resolution', 'ratio', 'duration')}}
        if before == after:
            continue
        validate_offering({'config': model.config, 'adapter': model.adapter, 'operation': model.operation, 'parameters': after})
        model.parameters = after
        db.add(Audit(actor_id=actor.id, action='seedance.specs.upgrade', target=model.id,
                     details={'before': before, 'after': after, 'price_changed': False}))
        changed.append(model.name)
    db.commit()
    return changed


if __name__ == '__main__':
    with Session() as db:
        print({'updated': upgrade(db)})
