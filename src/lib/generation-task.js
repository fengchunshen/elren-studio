// A persisted successful result can arrive before its history entry is updated.
export function generationTaskForNode(node, history) {
    const task = history.filter(item => item.sourceNodeId === node.id)
        .sort((a, b) => (b.startTime || 0) - (a.startTime || 0))[0];
    if (!task) return undefined;
    if (node.resultTaskCreatedAt && task.startTime < node.resultTaskCreatedAt * 1000) return undefined;
    if (node.content && node.resultTaskId === task.id && task.status === 'generating') {
        return { ...task, status: 'completed', errorMsg: '' };
    }
    return task;
}
