import { NODE_DEFINITIONS, connectionError, nodeMedia, nodeText } from './node-io';
import { activePromptReferences, promptToken } from './prompt-references';

export const nodeDisplayName = node => node?.title || `${NODE_DEFINITIONS[node?.type]?.name || '节点'} · ${String(node?.id || '').slice(-4)}`;
export function describeReference(node, target, port = 'default', task, media = nodeMedia(node), text = nodeText(node)) {
    const error = connectionError(node, target, port);
    const accepted = NODE_DEFINITIONS[target?.type]?.inputs?.[port]?.types || [];
    const ready = !error && (media.some(item => accepted.includes(item.type)) || accepted.includes('text') && text.length > 0);
    const status = ready ? (task?.status === 'generating' ? '使用已有结果 · 新结果生成中' : '可用')
        : error || (task?.status === 'reconciling' ? '结果待核对' : task?.status === 'generating' ? '生成中' : task?.errorMsg || task?.status === 'failed' ? '生成失败' : '暂无可用内容');
    return { id: node.id, node, label: nodeDisplayName(node), ready: Boolean(ready), status, error,
        thumbnail: media.find(item => item.type === 'image')?.url || '',
        summary: text.join(' ').slice(0, 160) || node.settings?.prompt || node.videoFileName || node.audioFileName || '', media };
}
// Legacy snapshots lack identity; match their media URLs without changing newer references.
export function referenceMatchesSource(reference, source, media = nodeMedia(source)) {
    if (reference.sourceNodeId) return reference.sourceNodeId === source.id;
    return reference.resources?.some(item => item.url && media.some(asset => asset.url === item.url));
}
export function removeSourceReferences(settings, sources) {
    const removed = (settings.promptReferences || []).filter(ref => sources.some(source => referenceMatchesSource(ref, source.node || source, source.media)));
    const strip = value => removed.reduce((text, ref) => text.replaceAll(promptToken(ref), ''), value || '');
    const urls = new Set(sources.flatMap(source => (source.media || nodeMedia(source.node || source)).map(item => item.url)));
    return { ...settings, prompt: strip(settings.prompt), videoPrompt: strip(settings.videoPrompt),
        promptReferences: (settings.promptReferences || []).filter(ref => !removed.includes(ref)),
        referenceImages: (settings.referenceImages || []).filter(url => !urls.has(url)) };
}
export function removedPromptSources(before, after, sources) {
    const key = Object.hasOwn(after, 'videoPrompt') ? 'videoPrompt' : 'prompt';
    if (!Object.hasOwn(after, key)) return [];
    const refs = before.promptReferences || [];
    const previous = activePromptReferences(before[key], refs);
    const remaining = new Set(activePromptReferences(after[key], after.promptReferences || refs).map(ref => ref.id));
    const removed = previous.filter(ref => !remaining.has(ref.id));
    return sources.filter(source => removed.some(ref => referenceMatchesSource(ref, source.node || source, source.media)));
}
