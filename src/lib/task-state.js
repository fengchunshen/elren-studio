const terminal = new Set(['succeeded', 'partially_succeeded', 'failed', 'canceled']);

export const requiresTaskReconciliation = task => task.status === 'reconciling' && task.recovery?.automatic === false;
export const taskWatchComplete = task => terminal.has(task.status) || requiresTaskReconciliation(task);
export const taskHistoryStatus = task => ['succeeded', 'partially_succeeded'].includes(task.status) ? 'completed'
    : ['failed', 'canceled'].includes(task.status) ? 'failed'
        : requiresTaskReconciliation(task) ? 'reconciling' : 'generating';
