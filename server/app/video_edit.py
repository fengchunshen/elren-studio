"""Versioned editor contract, independent from any unverified vendor protocol."""
import math

OPERATIONS = {'video.replace', 'video.remove', 'video.retake', 'video.extend'}


def numeric(value, low, high):
    return type(value) in (int, float) and math.isfinite(value) and low <= value <= high


def validate_video_edit(operation, value, references, asset_kinds):
    if not isinstance(value, dict) or type(value.get('version')) is not int or value['version'] != 1:
        raise ValueError('视频编辑输入版本不支持')
    field = 'target' if operation in {'video.replace', 'video.remove'} else 'shots' if operation == 'video.retake' else 'extension'
    if set(value) != {'version', 'source_duration', field}:
        raise ValueError('视频编辑字段与操作不匹配')
    duration = value['source_duration']
    if not numeric(duration, 0.001, 86400):
        raise ValueError('原片时长无效')
    expected = {'source': 'video'}
    if field == 'target':
        expected['target_frame'] = 'image'
        if operation == 'video.replace':
            expected['replacement'] = 'image'
    if len(references) != len(expected) or len({r['asset_id'] for r in references}) != len(references):
        raise ValueError('视频编辑需要独立的原片、目标帧及对应替换素材')
    for role, kind in expected.items():
        matches = [r for r in references if r['role'] == role]
        if len(matches) != 1 or asset_kinds.get(matches[0]['asset_id']) != kind:
            raise ValueError(f'视频编辑缺少有效的 {role} 素材')
    if field == 'target':
        target = value['target']
        if not isinstance(target, dict) or set(target) != {'time', 'box'} or not numeric(target['time'], 0, duration) or target['time'] >= duration:
            raise ValueError('目标帧时间超出原片')
        box = target['box']
        if not isinstance(box, dict) or set(box) != {'x', 'y', 'width', 'height'} or not all(numeric(v, 0, 1) for v in box.values()):
            raise ValueError('对象选区必须是归一化矩形')
        if box['width'] <= 0 or box['height'] <= 0 or box['x'] + box['width'] > 1.000001 or box['y'] + box['height'] > 1.000001:
            raise ValueError('对象选区超出画面')
    elif field == 'shots':
        shots = value['shots']
        if not isinstance(shots, list) or not 1 <= len(shots) <= 20:
            raise ValueError('需要 1–20 个重拍片段')
        previous = 0
        for shot in shots:
            if not isinstance(shot, dict) or set(shot) != {'start', 'end', 'camera', 'framing', 'motion', 'prompt'}:
                raise ValueError('重拍片段格式不正确')
            if not numeric(shot['start'], previous, duration) or not numeric(shot['end'], 0, duration) or shot['end'] <= shot['start']:
                raise ValueError('重拍片段必须按时间排列且不能重叠或越界')
            if shot['camera'] not in {'original', 'front', 'side', 'overhead', 'low'} or shot['framing'] not in {'original', 'wide', 'medium', 'close'} or shot['motion'] not in {'preserve', 'static', 'push', 'pull', 'orbit'}:
                raise ValueError('重拍机位、景别或运动方式无效')
            if not isinstance(shot['prompt'], str) or not shot['prompt'].strip() or len(shot['prompt']) > 10000:
                raise ValueError('重拍片段需要描述')
            previous = shot['end']
    else:
        extension = value['extension']
        if not isinstance(extension, dict) or set(extension) != {'direction', 'duration'} or extension['direction'] not in {'before', 'after'} or not numeric(extension['duration'], 0.001, 60):
            raise ValueError('延长方向或时长无效')
