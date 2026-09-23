import { nativeFetch } from './apiClient';
import { platformEnabled, platformModel, getPlatformContext } from './platformContext';
import { submitTask, supportedParameters } from './taskService';

export function modelCredentials(id) {
    const model = getPlatformContext()?.models.find(item => item.id === id);
    // Render-time status checks must also work for historical or disabled models.
    if (!model) return {key: '', url: 'elren-model://unavailable', modelName: id || '', provider: 'platform', apiType: 'openai', useProxy: false};
    return {key: 'platform-session', url: `elren-model://${model.id}`, modelName: model.id,
        displayName: model.name, provider: 'platform', apiType: 'openai', useProxy: false, forceAsync: false};
}

async function inlineImage(url) {
    if (url.startsWith('data:')) return url;
    const blob = await nativeFetch(url).then(response => response.blob());
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// A module-local compatibility boundary for the editor's existing text/analysis calls.
// It never patches window.fetch or exposes an arbitrary server proxy.
export async function modelFetch(url, options = {}) {
    const target = String(url);
    if (!platformEnabled) return nativeFetch(url, options);
    if (target.startsWith('elren-model://')) {
        const parsed = new URL(target), model = platformModel(parsed.hostname);
        if (parsed.pathname === '/v1/models') return new Response(JSON.stringify({data: getPlatformContext().models.map(item => ({id: item.id}))}));
        if (parsed.pathname !== '/v1/chat/completions' || model.operation !== 'text.generate') throw new Error('此模型操作尚未在平台开放');
        const body = JSON.parse(options.body || '{}');
        const messages = await Promise.all((body.messages || []).map(async message => ({role: message.role,
            content: Array.isArray(message.content) ? await Promise.all(message.content.map(async part => part.type === 'image_url'
                ? {...part, image_url: {...part.image_url, url: await inlineImage(part.image_url.url)}} : part)) : message.content})));
        const task = await submitTask(model.id, {messages, parameters: supportedParameters(model.id, body)}, {kind: 'editor.text'});
        return new Response(JSON.stringify({choices: [{message: {role: 'assistant', content: task.result.text}}], platform_task: task}), {headers: {'Content-Type': 'application/json'}});
    }
    const headers = new Headers(options.headers || {});
    if (headers.has('authorization') || headers.has('x-api-key') || /[?&]key=/.test(target)) {
        throw new Error('平台模式只支持已开放的后端模型调用');
    }
    return nativeFetch(url, options);
}
