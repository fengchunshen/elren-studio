let context = import.meta.hot?.data?.context || null;
if (import.meta.hot?.dispose) import.meta.hot.dispose(data => { data.context = context; });
export const platformEnabled = import.meta.env.VITE_PLATFORM_MODE === 'true';
export function setPlatformContext(value) { context = value; }
export function getPlatformContext() { return context; }
export function platformModel(id) {
    const model = context?.models.find(item => item.id === id);
    if (!model) throw new Error('请先选择可用模型');
    return model;
}
export function editorModels() {
    return (context?.models || []).map(model => ({
        id: model.id, _uid: model.id, modelName: model.id, displayName: model.name,
        tags: model.tags || [], description: model.description || '',
        provider: 'platform', apiType: 'openai', type: operationType(model.operation), inputs: model.inputs,
        supportsFirstLastFrame: Boolean(model.inputs?.frames),
        platformOperation: model.operation, resolutions: model.parameters.resolution?.enum || model.parameters.size?.enum || [],
        ratios: model.parameters.ratio?.enum || model.parameters.aspect_ratio?.enum || [],
        durations: (model.parameters.duration?.enum || []).map(String),
        customParams: Object.entries(model.parameters).filter(([, spec]) => !spec.hidden).map(([name, spec]) => ({name, label: spec.label || ({generate_audio:'生成音频',max_tokens:'回复长度',temperature:'创意程度',size:'画质',resolution:'清晰度',duration:'时长',ratio:'比例',seed:'随机种子'})[name] || name, type: spec.type, min: spec.min, max: spec.max, required: spec.required, multiline: spec.multiline, values: (spec.enum || []).map(String), defaultValue: spec.default})),
    }));
}
export function operationType(operation) {
    return ({ text: 'Chat', image: 'Image', video: 'Video', audio: 'Audio', model: 'Model' })[String(operation).split('.')[0]] || 'Unsupported';
}
