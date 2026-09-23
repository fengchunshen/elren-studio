import React from 'react';
import { expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ExtractionBody, ExtractionInspector } from '@/components/editor/node-frame';
it('shows the actual input and blocks execution until a usable model is selected', () => {
    const node = { id: 'extract', settings: {} }, run = vi.fn();
    const view = render(<><ExtractionBody node={node} input="森林中的摄影师" /><ExtractionInspector node={node} input="森林中的摄影师" models={[]} onRun={run} /></>);
    expect(screen.getByText('森林中的摄影师')).toBeTruthy();
    expect(screen.getByRole('button', { name: '开始提取' }).disabled).toBe(true);
    view.rerender(<ExtractionInspector node={{ ...node, settings: { model: 'chat' } }} input="森林中的摄影师" models={[{ id: 'chat', name: '文字模型' }]} onRun={run} />);
    fireEvent.click(screen.getByRole('button', { name: '开始提取' }));
    expect(run).toHaveBeenCalledTimes(1);
});
