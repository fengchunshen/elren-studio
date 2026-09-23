import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { api } from '@/services/apiClient';
import { watchTask } from '@/services/taskService';
import { taskHistoryStatus } from '@/lib/task-state';
import { GenerationBody } from '@/components/editor/generation-node';
import { applyTaskNodeResult } from '@/lib/task-node-result';
import { CreatorPanel } from '@/platform/CreatorAccount';

vi.mock('@/services/apiClient', () => ({ api: vi.fn(), nativeFetch: vi.fn() }));
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

it('stops querying a manual reconciliation task without reporting it as failed', async () => {
    vi.useFakeTimers();
    const task = { id: 'manual-task', status: 'reconciling', recovery: { mode: 'manual', automatic: false } };
    api.mockResolvedValue(task);
    expect(await watchTask(task.id)).toBe(task);
    await vi.advanceTimersByTimeAsync(10000);
    expect(api).toHaveBeenCalledTimes(1);
    expect(taskHistoryStatus(task)).toBe('reconciling');
});

it('continues polling when the backend can safely recover the existing task', async () => {
    vi.useFakeTimers();
    api.mockResolvedValueOnce({ id: 'poll-task', status: 'reconciling', recovery: { mode: 'poll', automatic: true } })
        .mockResolvedValueOnce({ id: 'poll-task', status: 'succeeded' });
    const promise = watchTask('poll-task');
    await vi.advanceTimersByTimeAsync(2500);
    expect((await promise).status).toBe('succeeded');
    expect(api).toHaveBeenCalledTimes(2);
});

it('shows a quiet pending-review state instead of endless generation or a false failure', () => {
    render(<GenerationBody node={{ type: 'gen-image' }} task={{ status: 'reconciling', errorMsg: '生成服务响应超时，未收到结果。需人工核对，请勿重复生成。' }} />);
    expect(screen.getByRole('status').textContent).toContain('结果待人工核对');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText('正在生成…')).toBeNull();
    const node = { id: 'text', settings: { text: '保留内容', textGenerating: true } };
    const next = applyTaskNodeResult(node, { status: 'reconciling', recovery: { automatic: false }, source: { node_id: 'text' }, operation: 'text.generate' });
    expect(next.settings).toEqual({ text: '保留内容', textGenerating: false });
});

it('distinguishes manual review and unknown fees in the creator usage table', async () => {
    api.mockResolvedValue({ items: [{ id: 'manual-usage', model_name: '图片模型', created_at: 1,
        status: 'reconciling', recovery: { mode: 'manual', automatic: false }, billing: { status: 'pending', amount: null } }] });
    render(<CreatorPanel kind="usage" user={{ username: 'creator' }} projects={[]} onClose={() => {}} />);
    expect(await screen.findByText('待人工核对')).toBeTruthy();
    expect(screen.getByText('待核算')).toBeTruthy();
    expect(screen.queryByText('¥0')).toBeNull();
});
