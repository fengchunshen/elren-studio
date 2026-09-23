import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { GenerationBody } from '@/components/editor/generation-node';
import userEvent from '@testing-library/user-event';

afterEach(() => { cleanup(); vi.useRealTimers(); });

it('selects with a pointer click, previews once with a double click, and supports keyboard activation', async () => {
    const user = userEvent.setup();
    const onPreview = vi.fn();
    render(<GenerationBody node={{ type: 'gen-image', content: '/result.png' }} onPreview={onPreview} />);
    const image = screen.getByRole('button', { name: '预览图片' });
    await user.click(image);
    expect(onPreview).not.toHaveBeenCalled();
    await user.dblClick(image);
    expect(onPreview).toHaveBeenCalledTimes(1);
    expect(onPreview).toHaveBeenCalledWith('/result.png');
    onPreview.mockClear();
    await user.keyboard('{Enter}');
    expect(onPreview).toHaveBeenCalledTimes(1);
    expect(onPreview).toHaveBeenCalledWith('/result.png');
    onPreview.mockClear();
    await user.keyboard(' ');
    expect(onPreview).toHaveBeenCalledTimes(1);
    expect(onPreview).toHaveBeenCalledWith('/result.png');
});

it('keeps the old image previewable while hiding replacement, then restores replacement on completion', () => {
    const onPreview = vi.fn();
    const props = { node: { type: 'gen-image', content: '/old.png' }, onFile: vi.fn(), onPreview };
    const { rerender } = render(<GenerationBody {...props} task={{ status: 'generating', progress: 95 }} />);
    expect(screen.getByRole('status').textContent).toBe('正在生成新图片');
    expect(screen.getByText('当前显示上次结果')).toBeTruthy();
    expect(screen.queryByText(/95%/)).toBeNull();
    expect(screen.queryByRole('button', { name: '更换图片' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '预览图片' }));
    expect(onPreview).toHaveBeenCalledWith('/old.png');
    rerender(<GenerationBody {...props} task={{ status: 'completed' }} />);
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('button', { name: '更换图片' })).toBeTruthy();
});

it('shows elapsed time only from a real start time and stops updating after completion', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-15T12:00:00Z'));
    const startTime = Date.now() - 65000;
    const { rerender } = render(<GenerationBody node={{ type: 'gen-image' }} task={{ status: 'generating', startTime }} />);
    expect(screen.getByLabelText('已等待 1:05')).toBeTruthy();
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.getByLabelText('已等待 1:07')).toBeTruthy();
    rerender(<GenerationBody node={{ type: 'gen-image' }} task={{ status: 'completed' }} />);
    expect(vi.getTimerCount()).toBe(0);
});

it('uses a dedicated empty generation state and preserves recovery and failure messages', () => {
    const props = { node: { type: 'gen-video' }, onFile: vi.fn() };
    const { rerender } = render(<GenerationBody {...props} task={{ status: 'generating' }} />);
    expect(screen.getByRole('status').textContent).toBe('视频生成中');
    expect(screen.queryByRole('button', { name: '上传视频' })).toBeNull();
    expect(screen.queryByLabelText(/已等待/)).toBeNull();
    rerender(<GenerationBody {...props} task={{ status: 'reconciling', errorMsg: '请勿重复生成' }} />);
    expect(screen.getByRole('status').textContent).toContain('结果待人工核对');
    expect(screen.queryByText('视频生成中')).toBeNull();
    rerender(<GenerationBody {...props} task={{ status: 'failed', errorMsg: '生成失败，请调整提示词' }} />);
    expect(screen.getByRole('alert').textContent).toContain('生成失败，请调整提示词');
});
