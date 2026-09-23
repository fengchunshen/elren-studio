import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { NodeAddControls } from '@/components/editor/node-add-controls';
import { OverlaySuspensionContext } from '@/components/ui/overlay-suspension';

it('opens the creation menu, accepts a compatible type once and closes with Escape', async () => {
    const onCreate = vi.fn(), onReference = vi.fn(), user = userEvent.setup();
    render(<NodeAddControls node={{ id: 'source', type: 'text-node' }} onCreate={onCreate} onReference={onReference} />);
    expect(screen.getAllByRole('button')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: '添加节点参考' }));
    expect(onReference).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: '引用该节点生成' }));
    expect(screen.getAllByRole('menuitem')).toHaveLength(5);
    await user.click(screen.getByRole('menuitem', { name: '图片生成' }));
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate).toHaveBeenCalledWith('gen-image');
    await user.click(screen.getByRole('button', { name: '引用该节点生成' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
}, 40000);

it('keeps creation options available and does not reopen after dragging', async () => {
    const onCreate = vi.fn(), user = userEvent.setup();
    const control = <NodeAddControls node={{ id: 'audio', type: 'audio-input' }} onCreate={onCreate} onReference={() => {}} />;
    const view = render(<OverlaySuspensionContext.Provider value={false}>{control}</OverlaySuspensionContext.Provider>);
    expect(screen.queryByRole('button', { name: '添加节点参考' })).toBeNull();
    await user.click(screen.getByRole('button', { name: '引用该节点生成' }));
    expect(screen.getByRole('menuitem', { name: '图片生成' }).getAttribute('data-disabled')).toBeNull();
    view.rerender(<OverlaySuspensionContext.Provider value>{control}</OverlaySuspensionContext.Provider>);
    expect(screen.queryByRole('menu')).toBeNull();
    view.rerender(<OverlaySuspensionContext.Provider value={false}>{control}</OverlaySuspensionContext.Provider>);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(onCreate).not.toHaveBeenCalled();
}, 40000);
