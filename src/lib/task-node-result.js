import { taskHistoryStatus } from './task-state';

export function applyTaskNodeResult(node, task) {
    if (node.id !== task.source?.node_id) return node;
    const created = task.created_at || 0;
    if ((node.resultTaskCreatedAt || 0) > created) return node;
    const done = ['succeeded', 'partially_succeeded'].includes(task.status);
    if (!done) {
        if (task.operation !== 'text.generate') return node;
        const busy = taskHistoryStatus(task) === 'generating';
        return Boolean(node.settings?.textGenerating) === busy ? node : { ...node, settings: { ...node.settings, textGenerating: busy } };
    }
    // Restoration must not overwrite an edit or result choice made after this task completed.
    if (node.resultTaskId === task.id) return node;
    const url = task.result?.assets?.[0]?.url;
    const text = typeof task.result?.text === 'string' ? task.result.text : '';
    if (!url && !text) return node;
    return { ...node, ...(url ? { content: url } : {}), resultTaskId: task.id, resultTaskCreatedAt: created,
        ...(task.operation === 'text.generate' ? { settings: { ...node.settings, text, richText: '', textGenerating: false } }
            : task.operation === 'audio.generate' ? { settings: { ...node.settings, text } } : {}) };
}
