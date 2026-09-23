import React, { StrictMode } from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ElrenLoadingProvider, ELREN_LOADING_EXIT_MS } from '@/components/brand/elren-loading-provider';
import { useElrenLoading } from '@/components/brand/elren-loading-context';

function Activity({ active, label }) { useElrenLoading(active, label); return null; }
function Fixture({ auth = false, snapshot = false }) {
    return <StrictMode><ElrenLoadingProvider>
        <Activity active={auth} label="正在连接工作空间…" />
        <Activity active={snapshot} label="正在读取项目…" />
        <button>画布已就绪</button>
    </ElrenLoadingProvider></StrictMode>;
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it('keeps one animation alive across overlapping loading stages and releases interaction immediately', () => {
    vi.useFakeTimers();
    const view = render(<Fixture auth />);
    const scene = view.container.querySelector('.elren-loading-screen');
    const mark = scene.querySelector('.elren-motion-mark');
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(view.container.querySelector('.elren-loading-content').hasAttribute('inert')).toBe(true);
    view.rerender(<Fixture auth snapshot />);
    view.rerender(<Fixture snapshot />);
    expect(view.container.querySelector('.elren-loading-screen')).toBe(scene);
    expect(scene.querySelector('.elren-motion-mark')).toBe(mark);
    expect(screen.getByRole('status').textContent).toContain('正在读取项目…');
    view.rerender(<Fixture />);
    expect(screen.queryByRole('status')).toBeNull();
    expect(scene.dataset.state).toBe('exiting');
    expect(view.container.querySelector('.elren-loading-content').hasAttribute('inert')).toBe(false);
    act(() => vi.advanceTimersByTime(ELREN_LOADING_EXIT_MS));
    expect(view.container.querySelector('.elren-loading-screen')).toBeNull();
});

it('cancels a pending exit when another real loading stage begins', () => {
    vi.useFakeTimers();
    const view = render(<Fixture auth />);
    const scene = view.container.querySelector('.elren-loading-screen');
    view.rerender(<Fixture />);
    act(() => vi.advanceTimersByTime(90));
    view.rerender(<Fixture snapshot />);
    act(() => vi.advanceTimersByTime(200));
    expect(view.container.querySelector('.elren-loading-screen')).toBe(scene);
    expect(scene.dataset.state).toBe('loading');
    expect(screen.getByRole('status').textContent).toContain('正在读取项目…');
});

it('removes the scene without a fade delay when reduced motion is requested', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const view = render(<Fixture auth />);
    view.rerender(<Fixture />);
    expect(view.container.querySelector('.elren-loading-screen')).toBeNull();
});
