export function parseStoryboardSourceNodeId(sourceNodeId) {
    if (typeof sourceNodeId !== 'string' || !sourceNodeId.startsWith('storyboard-')) return null;
    const isImageMode = sourceNodeId.startsWith('storyboard-img-');
    const prefix = isImageMode ? 'storyboard-img-' : 'storyboard-';
    const separator = sourceNodeId.indexOf('-shot-', prefix.length);
    if (separator < 0) return null;
    const nodeId = sourceNodeId.slice(prefix.length, separator);
    const shotId = sourceNodeId.slice(separator + '-shot-'.length);
    return nodeId && shotId ? { nodeId, shotId, isImageMode } : null;
}
