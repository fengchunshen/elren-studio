import { nodeMedia } from './node-io';
import { nodeDisplayName } from './canvas-references';

export function timelineSourcesForNode(node, media = nodeMedia(node)) {
    if (node.type === 'storyboard-node') return node.settings?.mode === 'video' ? (node.settings.shots || [])
        .filter(shot => shot.outputEnabled && (shot.output_url || shot.video_url))
        .map((shot,index) => ({ nodeId: node.id, shotId: shot.id, name: shot.title || `镜头 ${index+1}`, url: shot.output_url || shot.video_url, duration: parseFloat(shot.duration) || null })) : [];
    return [{ nodeId: node.id, name: nodeDisplayName(node), duration: node.videoMeta?.duration, url: media.find(item => item.type === 'video')?.url }];
}
const sourceKey = source => `${source.nodeId}:${source.shotId || ''}`;

export function appendConnectedVideoClips(clips, sources) {
    const known = new Set(clips.filter(clip => clip.nodeId).map(sourceKey));
    const added = [];
    for (const source of sources) {
        if (!source.url || known.has(sourceKey(source))) continue;
        known.add(sourceKey(source));
        added.push({ id: crypto.randomUUID(), nodeId: source.nodeId, ...(source.shotId ? {shotId:source.shotId} : {}), url: source.url, name: source.name,
            start: 0, end: Number.isFinite(source.duration) && source.duration > 0 ? source.duration : null });
    }
    return added.length ? [...clips, ...added] : clips;
}

export function timelineSegments(clips, durations = {}) {
    let offset = 0;
    return clips.map(clip => {
        const start = Number(clip.start || 0), end = Number(clip.end ?? durations[clip.id] ?? 0);
        if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) return { ...clip, offset, length: 0, valid: false };
        const segment = { ...clip, start, end, offset, length: end - start, valid: true };
        offset += segment.length;
        return segment;
    });
}
export function timelinePosition(segments, time) {
    const index = segments.findIndex(segment => segment.valid && time < segment.offset + segment.length);
    const selected = index < 0 ? segments.length - 1 : index;
    const segment = segments[selected];
    if (!segment?.valid) return null;
    return { index: selected, sourceTime: Math.min(segment.end - 0.001, Math.max(segment.start, segment.start + time - segment.offset)) };
}
