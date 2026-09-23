import { nodeDisplayName } from './canvas-references';
export function nodePreview(node, url, history = []) {
    const task = history.find(item => item.sourceNodeId === node.id && [item.url, ...(item.mjImages || []), ...(item.output_images || [])].includes(url));
    const images = [...new Set([...(task?.mjImages || []), ...(task?.output_images || []), ...(node.previewMjImages || []), url].filter(Boolean))];
    return { type: 'image', url, title: nodeDisplayName(node), previewOrigin: 'canvas',
        prompt: task?.prompt || node.settings?.prompt || '', width: node.dimensions?.w || task?.width,
        height: node.dimensions?.h || task?.height, startTime: task?.startTime || node.resultTaskCreatedAt,
        mjImages: images, selectedMjImageIndex: images.indexOf(url) };
}
export function previewMetadata(item, measured) {
    const width = measured?.width || item?.width, height = measured?.height || item?.height;
    const time = item?.startTime || item?.created_at;
    const date = time ? new Date(time) : null;
    return [Number(width) > 0 && Number(height) > 0 ? `${width} × ${height}` : '',
        date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString() : ''].filter(Boolean).join(' · ');
}
