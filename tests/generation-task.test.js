import { expect, it } from 'vitest';
import { generationTaskForNode } from '@/lib/generation-task';

it('uses newest submission, even if an older timeout arrives later', () => {
    const old = {id:'old',sourceNodeId:'n',startTime:1000,status:'reconciling'};
    const latest = {id:'new',sourceNodeId:'n',startTime:2000,status:'completed'};
    expect(generationTaskForNode({id:'n'},[old,latest])).toBe(latest);
});
it('ends a stale spinner once the same task result is persisted, without hiding a new attempt', () => {
    const node = {id:'n',content:'/result.png',resultTaskId:'done',resultTaskCreatedAt:2};
    const task = {id:'done',sourceNodeId:'n',startTime:2000,status:'generating'};
    expect(generationTaskForNode(node,[task]).status).toBe('completed');
    const newer = {...task,id:'retry',startTime:3000};
    expect(generationTaskForNode(node,[task,newer])).toBe(newer);
    expect(generationTaskForNode(node,[{...task,id:'old',startTime:1000}])).toBeUndefined();
});
