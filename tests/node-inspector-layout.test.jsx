import React, { StrictMode, useCallback, useState } from 'react';
import { render, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { NodeInspector, NodeInspectorPanContext } from '@/components/editor/node-frame';

it('makes room below once under StrictMode without changing node geometry or replaying pan', async () => {
    const pan = vi.fn();
    const rect = (top, height, width = 280, left = 400) => ({ x: left, y: top, left, top, right: left + width, bottom: top + height, width, height });
    const geometry = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
        if (this.classList.contains('node-wrapper')) return rect(parseFloat(this.style.top), 200);
        if (this.hasAttribute('data-node-inspector')) return rect(0, 178, 640);
        return rect(0, window.innerHeight, window.innerWidth, 0);
    });
    function Harness() {
        const [panY, setPanY] = useState(0);
        const shift = useCallback(dy => { pan(dy); setPanY(y => y + dy); }, []);
        return <NodeInspectorPanContext.Provider value={shift}><div className="node-wrapper" style={{ top: 500 + panY }}>
            <NodeInspector label="测试设置" preferredWidth={640}><input aria-label="内容" defaultValue="保留输入" /></NodeInspector>
        </div></NodeInspectorPanContext.Provider>;
    }
    const view = render(<StrictMode><Harness /></StrictMode>);
    try {
        await waitFor(() => expect(pan).toHaveBeenCalledTimes(1));
        expect(pan).toHaveBeenCalledWith(window.innerHeight - 12 - 178 - 712);
        const node = document.querySelector('.node-wrapper'), panel = document.querySelector('[data-node-inspector]');
        await waitFor(() => expect(parseFloat(panel.style.top)).toBe(parseFloat(node.style.top) + 212));
        expect(panel.getAttribute('data-side')).toBe('bottom');
        expect(panel.querySelector('input').value).toBe('保留输入');
        expect(pan).toHaveBeenCalledTimes(1);
    } finally { view.unmount(); geometry.mockRestore(); }
});
