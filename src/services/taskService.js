import { api, nativeFetch } from './apiClient';
import { getPlatformContext, platformModel } from './platformContext';
import { taskWatchComplete } from '@/lib/task-state';

const watchers = new Map();
export const notifyTask = task => window.dispatchEvent(new CustomEvent('platform:task', { detail: task }));
export function watchTask(id) {
    if (watchers.has(id)) return watchers.get(id);
    const promise = (async () => {
        for (;;) {
            let task;
            try { task = await api(`/tasks/${id}`); }
            catch (error) {
                if ([401, 403, 404].includes(error.status)) throw error;
                await new Promise(resolve => setTimeout(resolve, 5000));
                continue;
            }
            notifyTask(task);
            if (taskWatchComplete(task)) return task;
            await new Promise(resolve => setTimeout(resolve, 2500));
        }
    })().finally(() => watchers.delete(id));
    watchers.set(id, promise);
    return promise;
}

export async function restoreTasks() {
    const ctx = getPlatformContext();
    let cursor = '';
    do {
        const result = await api(`/tasks?project_id=${ctx.project.id}&limit=100${cursor ? `&cursor=${cursor}` : ''}`);
        for (const task of result.items) {
            notifyTask(task);
            if (!taskWatchComplete(task)) watchTask(task.id).catch(() => {});
        }
        cursor = result.next_cursor;
    } while (cursor);
}

export async function submitTask(modelId, input, source = {}, { test = false, onEstimate } = {}) {
    const ctx = getPlatformContext(), model = platformModel(modelId);
    const payload = { project_id: ctx.project.id, model_offering_id: model.id, operation: model.operation, input, source };
    const quote = await api('/pricing/estimate', {method: 'POST', body: payload});
    onEstimate?.(quote);
    window.dispatchEvent(new CustomEvent('platform:estimate', {detail: quote}));
    payload.input = quote.input;
    const key = crypto.randomUUID();
    const path = test ? `/admin/models/${modelId}/test` : '/tasks';
    const body = {...payload, quote_id: quote.quote_id};
    // Retry only an ambiguous HTTP delivery with the same identity and payload.
    let task;
    for (let attempt = 0; attempt < 3; attempt++) {
        try { task = await api(path, {method: 'POST', body, headers: {'Idempotency-Key': key}}); break; }
        catch (error) { if (error.status && error.status < 500 || attempt === 2) throw error; }
    }
    notifyTask(task);
    const result = await watchTask(task.id);
    if (!['succeeded', 'partially_succeeded'].includes(result.status)) {
        const error = new Error(result.error || '任务未完成');
        error.task = result;
        throw error;
    }
    return result;
}

export function supportedParameters(modelId, values) {
    const model = platformModel(modelId), result = {};
    for (const [key, spec] of Object.entries(model.parameters)) {
        let value = values[key] ?? spec.default;
        if (value === undefined || value === '') continue;
        if (spec.type === 'integer' || spec.type === 'number') value = Number(value);
        if (spec.type === 'boolean') value = value === true || value === 'true';
        if (spec.enum && typeof value === 'string') value = spec.enum.find(item => typeof item === 'string' && item.toLowerCase() === value.toLowerCase()) ?? value;
        if (spec.enum && !spec.enum.includes(value)) {
            throw new Error(`当前模型不支持 ${key}=${value}`);
        }
        result[key] = value;
    }
    return result;
}

export async function uploadAsset(source, name = 'input.png') {
    const blob = source instanceof Blob ? source : await nativeFetch(source).then(response => {
        if (!response.ok) throw new Error('参考素材读取失败');
        return response.blob();
    });
    const form = new FormData();
    form.append('project_id', getPlatformContext().project.id);
    form.append('file', blob, name);
    return api('/assets', {method: 'POST', body: form});
}

export async function prepareGeneration({modelId, prompt, images = [], references, shots, videoEdit, mask, parameters = {}, source}) {
    const model = platformModel(modelId);
    if (Number(parameters.n || parameters.count || 1) > 1 && !model.parameters.n && !model.parameters.count) throw new Error('该模型当前按单张生成，请将生成数量设为 1');
    if (images.length && model.operation === 'image.generate') throw new Error('请选择支持参考图的图片模型');
    if (videoEdit && model.inputs?.videoEdit !== 1) throw new Error('当前模型尚未接入视频专用编辑协议');
    const media = references || images.map(url => ({ url, type: 'image', role: 'reference' }));
    if (media.length > (model.inputs?.max ?? 20)) throw new Error('参考素材超过模型上限');
    for (const item of media) {
        if (!(model.inputs?.types || ['image']).includes(item.type)) throw new Error(`当前模型不支持${({ image: '图片', video: '视频', audio: '音频', model: '3D' })[item.type] || item.type}参考`);
    }
    const counts = {}, roles = {};
    for (const item of media) { counts[item.type] = (counts[item.type] || 0) + 1; roles[item.role || 'reference'] = (roles[item.role || 'reference'] || 0) + 1; }
    for (const [kind, count] of Object.entries(counts)) if (count > (model.inputs?.limits?.[kind] ?? model.inputs?.max ?? 20)) throw new Error('同类参考素材超过模型上限');
    if ((roles.first_frame || 0) > 1 || (roles.last_frame || 0) > 1) throw new Error('首帧和尾帧各只能选择一张图片');
    if ((roles.first_frame || roles.last_frame) && !model.inputs?.frames) throw new Error('当前模型未开放首尾帧输入');
    const assets = await Promise.all(media.map(item => uploadAsset(item.url, `reference.${({ image: 'png', video: 'mp4', audio: 'wav', model: 'glb' })[item.type] || 'bin'}`)));
    const maskAsset = mask ? await uploadAsset(mask, 'mask.png') : null;
    return { modelId, source, input: {prompt, asset_ids: assets.map(asset => asset.id),
        ...(references ? { references: assets.map((asset, index) => ({ asset_id: asset.id, role: media[index].role || 'reference' })) } : {}),
        ...(videoEdit ? { video_edit: videoEdit } : {}),
        ...(shots?.length ? { shots: shots.map(({ prompt, duration }) => ({ prompt, duration: Number(duration) })) } : {}),
        ...(maskAsset ? {mask_asset_id: maskAsset.id} : {}), parameters: supportedParameters(modelId, parameters)} };
}

export async function submitGeneration(options) {
    const prepared = await prepareGeneration(options);
    return submitTask(prepared.modelId, prepared.input, prepared.source);
}
