import { workflowInsertionPoint } from './workflow-groups';

export function audioCaptionUpdate(nodes, task) {
    if (task.operation !== 'audio.generate' || !['succeeded', 'partially_succeeded'].includes(task.status) || !task.result?.text?.trim()) return { nodes };
    const source = nodes.find(node => node.id === task.source?.node_id);
    if (!source || source.settings?.autoCaption === false || source.settings?.captionTaskId === task.id || source.resultTaskCreatedAt > task.created_at) return { nodes };
    const id = `subtitle-${task.id}`;
    const position = workflowInsertionPoint([{ x: 0, y: 0, width: 280, height: 200 }], nodes, { x: source.x + source.width + 240, y: source.y + source.height / 2 });
    const next = nodes.map(node => node.id === source.id ? { ...node, settings: { ...node.settings, captionTaskId: task.id } } : node);
    if (!nodes.some(node => node.id === id)) next.push({ id, type: 'text-node', title: '音频字幕', x: position.x - 140, y: position.y - 100, width: 280, height: 200, settings: { text: task.result.text }, captionSourceTaskId: task.id });
    return { nodes: next, connection: { id: `caption-link-${task.id}`, from: source.id, to: id, inputType: 'default' } };
}
