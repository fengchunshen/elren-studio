import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GenerationPanel, GenerationPopover, GenerationChoice } from '@/components/editor/generation-controls';
import { Popover, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { useOverlayDismissSurface } from '@/components/ui/overlay-dismiss-surface';
afterEach(cleanup);
const stop = event => event.stopPropagation();
function Harness({ onPanelClick = vi.fn(), onNested = vi.fn() }) {
    const ref = useOverlayDismissSurface();
    return <div ref={ref} onMouseDown={stop} onMouseUp={stop} onClick={stop}>
        <div data-testid="canvas-blank">画布空白</div>
        <GenerationPanel label="测试生成面板">
            <Popover><PopoverTrigger asChild><Button>生成规格</Button></PopoverTrigger>
                <GenerationPopover aria-label="规格内容">
                    <Button>画质 1K</Button>
                    <GenerationChoice label="嵌套参数" value="a" options={[{ value: 'a', label: '参数 A' }, { value: 'b', label: '参数 B' }]} onChange={onNested} />
                </GenerationPopover>
            </Popover>
            <Button onClick={onPanelClick}>面板其他位置</Button>
        </GenerationPanel>
    </div>;
}
it('closes on the first outside click in the portalled inspector and still performs that click', async () => {
    const user = userEvent.setup(), clicked = vi.fn();
    render(<Harness onPanelClick={clicked} />);
    await user.click(screen.getByRole('button', { name: '生成规格' }));
    await user.click(screen.getByRole('button', { name: '画质 1K' }));
    expect(screen.getByRole('dialog', { name: '规格内容' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '面板其他位置' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '规格内容' })).toBeNull());
    expect(clicked).toHaveBeenCalledTimes(1);
}, 30000);
it('closes on non-focusable canvas space even when mouse events are stopped', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: '生成规格' }));
    await user.click(screen.getByRole('button', { name: '画质 1K' }));
    await user.click(screen.getByTestId('canvas-blank'));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '规格内容' })).toBeNull());
}, 30000);
it('keeps the parent open while using a nested portalled parameter menu', async () => {
    const user = userEvent.setup(), selected = vi.fn();
    render(<Harness onNested={selected} />);
    await user.click(screen.getByRole('button', { name: '生成规格' }));
    await user.click(screen.getByRole('button', { name: '嵌套参数' }));
    await user.click(screen.getByRole('menuitemradio', { name: '参数 B' }));
    expect(selected).toHaveBeenCalledWith('b');
    expect(screen.getByRole('dialog', { name: '规格内容' })).toBeTruthy();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '规格内容' })).toBeNull());
}, 30000);
