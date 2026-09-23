import React, { useRef, useState } from 'react';
import { expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { CanvasCommentComposer } from '@/components/editor/canvas-comment-composer';

it('counts input and submits Enter while preserving Shift+Enter and IME composition', () => {
    const submit = vi.fn();
    function Harness() {
        const canvasRef = useRef(null);
        const [text, setText] = useState('');
        return <><div ref={canvasRef} /><CanvasCommentComposer draft={{ x: 200, y: 200, text }} view={{ x: 0, y: 0, zoom: 1 }} canvasRef={canvasRef}
            onChange={setText} onSubmit={submit} onClose={() => {}} onExitMode={() => {}} /></>;
    }
    render(<Harness />);
    const input = document.querySelector('[data-canvas-comment-editor] textarea');
    const send = document.querySelector('[data-canvas-comment-editor] button[type="submit"]');
    expect(send.disabled).toBe(true);
    expect(input.maxLength).toBe(200);
    fireEvent.change(input, { target: { value: '你好' } });
    expect(send.disabled).toBe(false);
    expect(document.querySelector('[aria-label="评论字数"]').textContent).toBe('2/200');
    fireEvent.compositionStart(input);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(submit).not.toHaveBeenCalled();
    fireEvent.compositionEnd(input);
    expect(fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })).toBe(true);
    expect(submit).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(submit).toHaveBeenCalledOnce();
});
