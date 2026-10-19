import { getNodeBounds } from './canvas-viewport';
import { cloneWorkflowGroups } from './workflow-groups';
import { connectionError, connectionPort, nodeText } from './node-io';
import productCover from '../assets/template-covers/product.jpg';
import openingCover from '../assets/template-covers/opening.jpg';
import detailCover from '../assets/template-covers/detail.jpg';
import { SHORT_DRAMA_BLUEPRINT } from './agent-workflow-library';
import { applyAgentWorkflow } from './canvas-agent-workflow';

export const NODE_NAMES = {
    'model-input': '3D 素材',
    'subject-reference': '主体参考',
    'gen-model': '3D 生成', 'video-process': '视频处理',
    'image-editor': '图片编辑器', 'image-process': '图片处理', 'video-timeline': '剪辑时间线', 'three-studio': '3D 片场',
    'audio-input': '音频素材', 'gen-audio': '音频生成', 'video-avatar': '数字人视频',
    'text-node': '文本', 'input-image': '图片素材', 'video-input': '视频素材', 'gen-image': '图片生成',
    'gen-video': '视频生成', 'novel-input': '小说输入', 'storyboard-node': '智能分镜', 'video-analyze': '视频拆解',
    'image-compare': '图像对比', preview: '预览窗口', 'local-save': '保存到本地',
    'extract-characters-scenes': '提取角色和场景', 'character-description': '角色描述', 'scene-description': '场景描述',
    'generate-character-image': '生成角色图片', 'generate-scene-image': '生成场景图片',
    'generate-character-video': '生成角色视频', 'generate-scene-video': '生成场景视频',
    'create-character': '创建角色', 'create-scene': '创建场景',
};
export function nodeTitle(node) {
    return node.title || node.name || node.settings?.projectTitle || NODE_NAMES[node.type] || '节点';
}
export function nodeSearchText(node) {
    const settings = node.settings || {};
    return [nodeTitle(node), settings.text, settings.prompt, settings.videoPrompt, settings.content,
        settings.description, settings.scriptText, settings.characterName, settings.sceneName, node.videoFileName, node.previewFilename,
        ...(settings.shots || []).flatMap(shot => [shot.description, shot.prompt])]
        .filter(value => typeof value === 'string').join('\n');
}
export function nodeCategory(node) {
    if (node.type === 'preview' && node.previewType === 'video') return 'video';
    if (['text-node', 'novel-input', 'character-description', 'scene-description'].includes(node.type)) return 'text';
    if (['gen-model', 'model-input'].includes(node.type)) return 'model';
    if (node.type.includes('audio')) return 'audio';
    if (node.type.includes('video')) return 'video';
    if (node.type.includes('image') || node.type === 'preview') return 'image';
    return 'tool';
}
export function filterCanvasNodes(nodes, query, category = 'all') {
    const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return nodes.filter(node => (category === 'all' || nodeCategory(node) === category)
        && terms.every(term => nodeSearchText(node).toLocaleLowerCase().includes(term)));
}

export function collectCanvasAssets(nodes, history) {
    const assets = new Map();
    const add = (url, value) => {
        if (typeof url !== 'string' || !url || assets.has(url)) return;
        assets.set(url, { ...value, url });
    };
    nodes.forEach(node => {
        if (nodeCategory(node) === 'text') {
            const text = nodeText(node).join('\n\n');
            if (text) assets.set(`text:${node.id}`, { id: `text:${node.id}`, name: nodeTitle(node), type: 'text', text, richText: node.settings?.richText, nodeId: node.id });
        }
        if (['image', 'video', 'audio', 'model'].includes(nodeCategory(node))) {
            add(node.content, { id: `node:${node.id}`, name: node.previewFilename || node.videoFileName || nodeTitle(node), type: nodeCategory(node), nodeId: node.id });
            (node.previewMjImages || []).forEach((url, index) => add(url, { id: `node:${node.id}:${index}`, name: `${nodeTitle(node)} ${index + 1}`, type: 'image', nodeId: node.id }));
        }
        (node.settings?.shots || []).forEach(shot => {
            add(shot.image_url, { id: `shot:${node.id}:${shot.id}:image`, name: shot.description || '分镜图片', type: 'image' });
            add(shot.output_url, { id: `shot:${node.id}:${shot.id}:video`, name: shot.description || '分镜视频', type: 'video' });
        });
    });
    history.forEach(item => {
        const urls = [...(item.mjImages || []), ...(item.output_images || []), item.url];
        urls.forEach((url, index) => add(url, { id: `history:${item.id}:${index}`, name: item.prompt || item.modelName || '生成素材', type: item.type === 'audio' ? 'audio' : item.type === 'video' ? 'video' : 'image' }));
    });
    return [...assets.values()];
}

export async function readLibraryMediaFile(file, folder = '其他') {
    const isModel = file.name.toLowerCase().endsWith('.glb');
    if (!/^(image|video|audio)\//.test(file.type) && !isModel) throw new Error('仅支持图片、视频、音频和 GLB 素材');
    const url = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error || new Error('素材读取失败'));
        reader.readAsDataURL(file);
    });
    if (typeof url !== 'string' || !url.startsWith('data:')) throw new Error('素材读取失败');
    return { kind: 'asset', name: file.name, type: isModel ? 'model' : file.type.split('/')[0], url, folder, favorite: false };
}

function preset(id, name, description, video = false) {
    return { id, name, description, builtin: true, kind: 'workflow', nodes: [
        { id: 'source', type: 'input-image', x: 0, y: 0, width: 320, height: 280, settings: {} },
        { id: 'text', type: 'text-node', x: 0, y: 340, width: 320, height: 220, settings: { text: video ? '描述主体、场景和镜头运动。上传首帧图片，再选择视频模型。' : '描述画面、风格和构图。上传参考图片，再选择图片模型。' } },
        { id: 'generate', type: video ? 'gen-video' : 'gen-image', x: 430, y: 60, width: 440, height: 420, settings: { prompt: '', videoPrompt: '', ratio: '16:9', duration: '5s' } },
        { id: 'result', type: 'preview', x: 980, y: 120, width: 380, height: 280, settings: {} },
    ], connections: [
        { from: 'source', to: 'generate' }, { from: 'text', to: 'generate' }, { from: 'generate', to: 'result' },
    ] };
}
const shortDrama = applyAgentWorkflow([], [], {id:'builtin-short-drama',arguments:SHORT_DRAMA_BLUEPRINT}, []);
export const BUILTIN_WORKFLOWS = [
    { ...preset('builtin-image', '产品图片创作', '参考图片 + 文案 → 图片生成 → 结果预览'), cover: productCover, coverFit: 'cover' },
    { ...preset('builtin-video', '图生视频', '首帧图片 + 镜头描述 → 视频生成 → 结果预览', true), cover: openingCover },
    { id: 'builtin-storyboard', name: '脚本与分镜', description: '整理脚本，连接智能分镜表，逐镜制作。', builtin: true, kind: 'workflow',
        cover: openingCover, coverFrames: [openingCover, productCover, detailCover],
        nodes: [
            { id: 'script', type: 'text-node', x: 0, y: 0, width: 340, height: 300, settings: { text: '镜头 1：交代场景与主体。\n镜头 2：呈现细节和动作。\n镜头 3：收束画面，留下记忆点。' } },
            { id: 'shots', type: 'storyboard-node', x: 440, y: 0, width: 720, height: 500, settings: { projectTitle: '三镜头分镜', mode: 'image', viewMode: 'cards', shots: [] } },
        ], connections: [{ from: 'script', to: 'shots' }] },
    { id:'builtin-short-drama',name:SHORT_DRAMA_BLUEPRINT.name,description:'剧本与人设 → 定妆/场景 → 确认分镜画面 → 对应镜头动画 → 剪辑；等待参考图时保留完整连线。',
        builtin:true,kind:'workflow',cover:openingCover,nodes:shortDrama.nodes,connections:shortDrama.connections },
];

export function instantiateWorkflow(workflow, point, models = {}) {
    if (!Array.isArray(workflow.nodes) || !workflow.nodes.length) throw new Error('模板中没有节点');
    if (workflow.nodes.some(node => !NODE_NAMES[node.type] || !Number.isFinite(node.x) || !Number.isFinite(node.y))) throw new Error('模板包含不支持的节点或无效位置');
    const original = JSON.parse(JSON.stringify(workflow.nodes));
    if (original.some(node => !node.id)) throw new Error('模板节点缺少 ID');
    const bounds = getNodeBounds(original);
    const ids = new Map(original.map(node => [node.id, `node-${crypto.randomUUID()}`]));
    if (ids.size !== original.length) throw new Error('模板的节点 ID 重复');
    const nodes = original.map(node => {
        const settings = { ...node.settings };
        if (!settings.model && models[node.type]) settings.model = models[node.type];
        delete settings.platformTaskId;
        delete settings.mediaJobId;
        delete settings.renderedJobId;
        delete settings.captionTaskId;
        settings.textGenerating = false;
        if (Array.isArray(settings.clips)) settings.clips = settings.clips.map(clip => ({ ...clip, id: crypto.randomUUID(), nodeId: ids.get(clip.nodeId) || clip.nodeId }));
        if (Array.isArray(settings.shots)) settings.shots = settings.shots.map(shot => ({ ...shot, status: shot.status === 'generating' ? 'draft' : shot.status, ...(shot.imageSource ? { imageSource: { ...shot.imageSource, nodeId: ids.get(shot.imageSource.nodeId) || shot.imageSource.nodeId } } : {}) }));
        const result = { ...node, id: ids.get(node.id), x: node.x + point.x - (bounds.left + bounds.right) / 2, y: node.y + point.y - (bounds.top + bounds.bottom) / 2, settings };
        delete result.platformTaskId;
        delete result.isGenerating;
        return result;
    });
    const connections = (workflow.connections || []).map(connection => {
        if (!ids.has(connection.from) || !ids.has(connection.to)) throw new Error('模板连线缺少对应节点');
        const source = original.find(node => node.id === connection.from), target = original.find(node => node.id === connection.to);
        const inputType = connectionPort(connection, workflow.connections || [], target);
        if (connectionError(source, target, inputType)) throw new Error('模板包含不兼容的连接，请先修复源工作流');
        return { ...connection, inputType, id: `conn-${crypto.randomUUID()}`, from: ids.get(connection.from), to: ids.get(connection.to) };
    });
    return { nodes: cloneWorkflowGroups(nodes), connections };
}
