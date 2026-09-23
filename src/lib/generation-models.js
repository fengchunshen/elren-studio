export const modelKey = model => model?._uid || model?.id;
export const modelName = model => model?.displayName || model?.name || model?.id;

// Platform operation names are authoritative; legacy configs only declare a type.
export function modelsForNode(models, nodeType) {
    const operations = nodeType === 'video-avatar' ? ['video.avatar']
        : nodeType.includes('video') ? ['video.generate']
            : ['gen-image', 'generate-character-image', 'generate-scene-image'].includes(nodeType) ? ['image.generate', 'image.edit']
                : nodeType === 'gen-audio' ? ['audio.generate'] : nodeType === 'gen-model' ? ['model.generate'] : ['text.generate'];
    const types = operations[0].startsWith('video') ? ['Video'] : operations[0].startsWith('image') ? ['Image', 'ChatImage']
        : nodeType === 'gen-audio' ? ['Audio'] : nodeType === 'gen-model' ? ['Model'] : ['Chat', 'ChatImage'];
    return models.filter(model => !model.disabled && model.enabled !== false && model.active !== false
        && (model.platformOperation ? operations.includes(model.platformOperation) : types.includes(model.type)));
}

const aliases = { ratio: ['ratio', 'aspect_ratio'], resolution: ['resolution', 'size'], duration: ['duration'], count: ['n', 'count'] };
export function modelField(model, kind) {
    return (model?.customParams || []).find(field => (aliases[kind] || [kind]).includes(field.name));
}

export function modelOptions(model, kind, fallback = []) {
    const field = modelField(model, kind);
    if (field?.values?.length) return field.values.map(String);
    if (model?.platformOperation) return [];
    return (model?.[({ resolution: 'resolutions', duration: 'durations', ratio: 'ratios' })[kind]] || fallback).map(String);
}

export function modelBadges(model) {
    const badges = [...new Set((model.tags || []).filter(tag => typeof tag === 'string' && tag.trim()))];
    const resolution = modelOptions(model, 'resolution');
    const quality = value => {
        const match = value.match(/^(\d+(?:\.\d+)?)(P|K)$/i);
        return match ? Number(match[1]) * (match[2].toUpperCase() === 'K' ? 1000 : 1) : 0;
    };
    if (resolution.length) badges.push(resolution.every(value => quality(value))
        ? resolution.reduce((best, value) => quality(value) > quality(best) ? value : best)
        : resolution[0]);
    const durations = modelOptions(model, 'duration').map(value => Number(value.replace(/s$/i, ''))).filter(Number.isFinite);
    const durationField = modelField(model, 'duration') || modelField(model, 'duration_seconds');
    if (durations.length) badges.push(`${Math.min(...durations)}${Math.max(...durations) !== Math.min(...durations) ? `–${Math.max(...durations)}` : ''}s`);
    else if (durationField?.min != null && durationField?.max != null) badges.push(`${durationField.min}–${durationField.max}s`);
    const purpose = { speech: '配音', music: '音乐', sound: '音效' }[model.inputs?.audioPurpose];
    if (purpose) badges.push(purpose);
    if (model.supportsFirstLastFrame || model.inputs?.frames) badges.push('首尾帧');
    if (model.inputs?.shots) badges.push('多镜头');
    const mediaTypes = model.inputs?.types || [];
    if (mediaTypes.length > 1 && model.inputs?.max !== 0) badges.push('多模态参考');
    else if (mediaTypes.includes('image') && model.inputs?.max !== 0 && !model.inputs?.frames && !model.supportsFirstLastFrame) badges.push(model.inputs?.limits?.image ? `参考图 ≤${model.inputs.limits.image}` : '图片参考');
    else if (mediaTypes.includes('video')) badges.push('视频参考');
    else if (mediaTypes.includes('audio')) badges.push('音频参考');
    if (model.platformOperation === 'image.generate') badges.push('文生图');
    if (model.platformOperation === 'image.edit') badges.push('图片编辑');
    return badges;
}

// Switching a model drops the previous model's private parameters, preserving
// only compatible common specs. Prompt, references, results and geometry stay put.
export function modelSelectionPatch(model, settings = {}) {
    const customParams = Object.fromEntries((model.customParams || []).filter(field => field.defaultValue != null).map(field => [field.name, field.defaultValue]));
    const patch = { model: modelKey(model), customParams };
    for (const kind of ['ratio', 'resolution', 'duration']) {
        const field = modelField(model, kind), options = modelOptions(model, kind);
        const previous = String(settings[kind] ?? settings.customParams?.[field?.name] ?? '').replace(kind === 'duration' ? /s$/i : /$^/, '');
        const matched = options.find(value => value.toLowerCase() === previous.toLowerCase());
        const numeric = Number(previous);
        const inRange = field && ['integer', 'number'].includes(field.type) && previous !== '' && Number.isFinite(numeric)
            && (field.min == null || numeric >= field.min) && (field.max == null || numeric <= field.max) && (field.type !== 'integer' || Number.isInteger(numeric));
        const value = matched ?? (inRange && !options.length ? previous : field?.defaultValue ?? options[0] ?? field?.min);
        patch[kind] = value == null ? '' : String(value);
        if (field && value != null) customParams[field.name] = value;
    }
    patch.size = modelField(model, 'resolution')?.name === 'size' ? patch.resolution : '';
    patch.useFirstLastFrame = Boolean(settings.useFirstLastFrame && (model.supportsFirstLastFrame || model.inputs?.frames));
    const count = modelField(model, 'count');
    patch.concurrentImages = Number(count?.defaultValue ?? count?.values?.[0] ?? count?.min ?? 1);
    patch.imageConcurrency = patch.concurrentImages;
    return patch;
}
