import { nodeMedia, NODE_DEFINITIONS } from './node-io';
import { nodeDisplayName } from './canvas-references';
import { generationTaskForNode } from './generation-task';

export function storyboardFrameCandidates(nodes, targetId, history = [], mediaForNode = node => nodeMedia(node, undefined, history)) {
    return nodes.filter(node => node.id !== targetId && NODE_DEFINITIONS[node.type]?.output.includes('image')).map(node => {
        const task = generationTaskForNode(node, history);
        const url = mediaForNode(node).find(media => media.type === 'image')?.url || '';
        return { id: node.id, label: nodeDisplayName(node), url, ready: Boolean(url),
            status: url ? task?.status === 'generating' ? '使用已有结果 · 新结果生成中' : '可用'
                : task?.status === 'generating' ? '生成中' : task?.status === 'reconciling' ? '结果待核对' : '暂无可用图片' };
    });
}

export function storyboardFramePatch(field, source) {
    return { [field]: source.url, [`${field}Source`]: { nodeId: source.id, name: source.label },
        ...(field === 'image_url' ? { image_filename: source.label } : {}) };
}

export function storyboardVideoReferences(shot) {
    return [
        ...(shot.image_url ? [{ url: shot.image_url, type: 'image', role: 'first_frame' }] : []),
        ...(shot.useFirstLastFrame && shot.lastFrame ? [{ url: shot.lastFrame, type: 'image', role: 'last_frame' }] : []),
    ];
}
