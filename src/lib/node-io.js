const port = (types, max = Infinity) => ({ types, max });
const reference = port(['text', 'image']);
export const NODE_DEFINITIONS = {
    'model-input': { name: '3D 素材', output: ['model', 'image'], inputs: {} },
    'subject-reference': { name: '主体参考', output: ['text', 'image', 'video', 'audio'], inputs: {} },
    'gen-model': { name: '3D 生成', output: ['model', 'image'], inputs: { default: port(['text', 'image']) } },
    'video-process': { name: '视频处理', output: ['video'], inputs: { default: port(['text', 'image', 'video', 'audio']) } },
    'image-editor': { name: '图片编辑器', output: ['image'], inputs: { default: port(['image']) } },
    'image-process': { name: '图片处理', output: ['image'], inputs: { default: port(['image'], 1) } },
    'video-timeline': { name: '剪辑时间线', output: ['video'], inputs: { default: port(['video']) } },
    'three-studio': { name: '3D 片场', output: ['image'], inputs: { default: port(['model'], 1) } },
    'audio-input': { name: '音频素材', output: ['audio'], inputs: {} },
    'gen-audio': { name: '音频生成', output: ['audio', 'text'], inputs: { default: port(['text', 'audio', 'video']) } },
    'video-avatar': { name: '数字人视频', output: ['video'], inputs: { default: port(['image', 'audio', 'text']) } },
    'text-node': { name: '文本', output: ['text'], inputs: { default: port(['text', 'image']) } },
    'novel-input': { name: '小说输入', output: ['text'], inputs: {} },
    'input-image': { name: '图片素材', output: ['image'], inputs: {} },
    'video-input': { name: '视频素材', output: ['video', 'image'], inputs: {} },
    'gen-image': { name: '图片生成', output: ['image'], inputs: { default: reference, oref: port(['image'], 1), sref: port(['image'], 1) } },
    'gen-video': { name: '视频生成', output: ['video'], inputs: { default: port(['text', 'image', 'video', 'audio']), veo_start: port(['image'], 1), veo_end: port(['image'], 1) } },
    'storyboard-node': { name: '智能分镜', output: ['text', 'image', 'video', 'analysis'], inputs: { default: port(['text', 'image', 'video', 'analysis']) } },
    'video-analyze': { name: '视频拆解', output: ['analysis', 'text'], inputs: { default: port(['image', 'video']) } },
    'extract-characters-scenes': { name: '角色与场景提取', output: ['entities'], inputs: { default: port(['text']) } },
    'character-description': { name: '角色描述', output: ['text'], inputs: { default: port(['entities', 'text']) } },
    'scene-description': { name: '场景描述', output: ['text'], inputs: { default: port(['entities', 'text']) } },
    'generate-character-image': { name: '角色图片', output: ['image'], inputs: { default: reference, oref: port(['image'], 1), sref: port(['image'], 1) } },
    'generate-scene-image': { name: '场景图片', output: ['image'], inputs: { default: reference, oref: port(['image'], 1), sref: port(['image'], 1) } },
    'generate-character-video': { name: '角色视频', output: ['video'], inputs: { default: reference, veo_start: port(['image'], 1), veo_end: port(['image'], 1) } },
    'generate-scene-video': { name: '场景视频', output: ['video'], inputs: { default: reference, veo_start: port(['image'], 1), veo_end: port(['image'], 1) } },
    'create-character': { name: '创建角色', output: ['entities'], inputs: { default: port(['video'], 1) } },
    'create-scene': { name: '创建场景', output: ['entities'], inputs: { default: port(['video'], 1) } },
    'image-compare': { name: '图像对比', output: [], inputs: { imageA: port(['image'], 1), imageB: port(['image'], 1) } },
    preview: { name: '结果预览', output: ['image', 'video', 'audio'], inputs: { default: port(['image', 'video', 'audio']) } },
    'local-save': { name: '保存到本地', output: [], inputs: { default: port(['image', 'video', 'audio']) } },
};

export function mediaType(type, url = '') {
    const raw = String(type || '').toLowerCase();
    if (['image', 'video', 'audio', 'model'].includes(raw)) return raw;
    if (raw) return null;
    if (/^data:(image|video|audio)\//i.test(url)) return url.slice(5).split('/')[0].toLowerCase();
    const path = String(url).split(/[?#]/)[0].toLowerCase();
    if (/\.(mp4|webm|mov|m4v)$/.test(path) || String(url).includes('force_video_display=true')) return 'video';
    if (/\.(mp3|wav|flac|aac|m4a|ogg|opus)$/.test(path)) return 'audio';
    if (/\.(glb|gltf)$/.test(path)) return 'model';
    if (/\.(png|jpg|jpeg|webp|gif|avif|svg)$/.test(path)) return 'image';
    return null;
}

export function nodeText(node) {
    if (!node || !NODE_DEFINITIONS[node.type]?.output.includes('text')) return [];
    const s = node.settings || {};
    if (node.type === 'gen-audio') return typeof s.text === 'string' && s.text.trim() ? [s.text.trim()] : [];
    const values = node.type === 'text-node' ? [s.text ?? node.content] : node.type === 'novel-input' ? [s.content ?? node.content]
        : [s.text, s.prompt, s.videoPrompt, s.content, s.description, s.summary];
    if (node.type === 'subject-reference') (s.resources || []).filter(item => item.type === 'text').forEach(item => values.push(item.text));
    if (node.type === 'storyboard-node') (s.shots || []).forEach(shot => values.push(shot.prompt, shot.description, shot.scene_description));
    if (node.type === 'video-analyze') (s.analysisResults || []).forEach?.(item => values.push(item.prompt, item.description, item.summary));
    return [...new Set(values.filter(value => typeof value === 'string').map(value => value.trim()).filter(Boolean))];
}

export function nodeMedia(node, resolve = value => value, history = []) {
    if (!node) return [];
    const result = [], s = node.settings || {};
    const latest = history.filter(item => item.sourceNodeId === node.id && ['completed', 'succeeded', 'partially_succeeded'].includes(item.status)).sort((a, b) => (b.startTime || 0) - (a.startTime || 0))[0];
    const content = node.content || latest?.url;
    const add = (value, type, role = 'media') => {
        if (typeof value !== 'string' || !value || /^(javascript|vbscript|file):/i.test(value)) return;
        const url = resolve(value);
        if (!url || result.some(item => item.url === url && item.type === type && item.role === role)) return;
        result.push({ type, url, role });
    };
    if (node.type === 'subject-reference') { (s.resources || []).filter(item => ['image', 'video', 'audio'].includes(item.type)).forEach(item => add(item.url, item.type)); } else if (['gen-model', 'model-input'].includes(node.type)) { add(content, 'model'); add(s.previewImage, 'image'); } else if (['image-editor', 'image-process', 'three-studio'].includes(node.type)) {
        add(content, 'image');
    } else if (['video-timeline', 'video-process'].includes(node.type)) {
        add(content, 'video');
    } else if (['audio-input', 'gen-audio'].includes(node.type)) {
        add(content, 'audio');
    } else if (node.type === 'video-input') {
        add(node.content, 'video', 'source');
        const frames = node.selectedKeyframes?.length ? node.selectedKeyframes : (node.frames || []).slice(0, 1);
        frames.forEach(frame => add(frame.url, 'image', 'frame'));
    } else if (['input-image', 'gen-image'].includes(node.type)) {
        add(content, 'image');
        (node.previewMjImages || []).forEach(url => add(url, 'image'));
    } else if (node.type === 'preview') {
        const type = mediaType(node.previewType, node.content) || 'image';
        add(node.content, type);
        (node.previewMjImages || []).forEach(url => add(url, 'image'));
    } else if (['gen-video', 'video-avatar', 'generate-character-video', 'generate-scene-video'].includes(node.type)) {
        add(content || s.videoUrl || s.output_url, 'video');
    } else if (['generate-character-image', 'generate-scene-image'].includes(node.type)) {
        const images = s.imageUrls?.length ? s.imageUrls : latest?.mjImages || latest?.output_images || [];
        const selected = images[s.selectedImageIndex ?? 0];
        add(selected || content, 'image');
    } else if (node.type === 'storyboard-node') {
        (s.shots || []).filter(shot => shot.outputEnabled).forEach(shot => {
            if (s.mode === 'image') add(shot.output_images?.[shot.selectedImageIndex], 'image');
            else if (shot.output_url) add(shot.output_url, 'video');
            else add(shot.image_url, 'image');
        });
    }
    return result;
}

export function connectionPort(connection, connections, target) {
    if (connection.inputType && connection.inputType !== 'default') return connection.inputType;
    if (target?.type !== 'image-compare') return 'default';
    // Legacy comparisons used two visual ports with one ID. Preserve original ordering.
    const legacy = connections.filter(item => item.to === connection.to && (!item.inputType || item.inputType === 'default'));
    const taken = new Set(connections.filter(item => item.to === connection.to).map(item => item.inputType));
    const available = ['imageA', 'imageB'].filter(id => !taken.has(id));
    return available[legacy.indexOf(connection)] || 'default';
}

export function connectionError(source, target, input = 'default') {
    if (!source || !target) return '节点不存在';
    if (source.id && source.id === target.id) return '不能连接节点自身';
    // A video upload can expose extracted frames, but an unextracted video must not
    // masquerade as an image to a consumer that cannot read the original video.
    const outputs = source.type === 'preview' && source.previewType ? [source.previewType]
        : source.type === 'video-input' ? ['video', ...(source.selectedKeyframes?.length || source.frames?.length ? ['image'] : [])]
        : NODE_DEFINITIONS[source.type]?.output || [];
    const targetPort = NODE_DEFINITIONS[target.type]?.inputs[input];
    if (!targetPort) return '该节点没有对应的输入端口';
    if (!outputs.some(type => targetPort.types.includes(type))) return '该输入不支持此类内容';
    return null;
}

// Multi-source creation is atomic: never silently replace a one-slot input or
// create a partially connected downstream node when one source is incompatible.
export function connectNodeSources(connections, sources, target, requestedPort = 'default') {
    const inputType = requestedPort === 'default' ? defaultInputPort(target) : requestedPort;
    const unique = [...new Map(sources.map(source => [source?.id, source])).values()];
    const error = unique.map(source => connectionError(source, target, inputType)).find(Boolean);
    if (error) return { connections, error };
    const limit = NODE_DEFINITIONS[target.type]?.inputs[inputType]?.max || 0;
    if (unique.length > limit) return { connections, error: '该输入无法同时接收全部选中节点' };
    return unique.reduce((result, source) => connectNodes(result.connections, source, target, inputType), { connections });
}

export function defaultInputPort(target) {
    return target?.type === 'image-compare' ? 'imageA' : 'default';
}

export function connectNodes(connections, source, target, requestedPort = 'default') {
    const inputType = requestedPort === 'default' ? defaultInputPort(target) : requestedPort;
    const error = connectionError(source, target, inputType);
    if (error) return { connections, error };
    const normalized = connections.map(item => item.to === target.id ? { ...item, inputType: connectionPort(item, connections, target) } : item);
    if (normalized.some(item => item.from === source.id && item.to === target.id && (item.inputType || 'default') === inputType)) return { connections };
    const limit = NODE_DEFINITIONS[target.type].inputs[inputType].max;
    const next = limit === 1 ? normalized.filter(item => !(item.to === target.id && item.inputType === inputType)) : normalized;
    return { connections: [...next, { id: `conn-${crypto.randomUUID()}`, from: source.id, to: target.id, inputType }] };
}
