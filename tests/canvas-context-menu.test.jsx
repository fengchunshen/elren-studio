import React, { useState } from 'react';
import { expect, it, vi } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';
import { CanvasContextMenu, CanvasConnectionMenu } from '@/components/editor/canvas-context-menu';
import '@/i18n';

function Harness(props) {
    const [open, setOpen] = useState(false);
    return <CanvasContextMenu open={open} onOpenChange={setOpen} {...props}>
        <div data-testid="canvas" onContextMenu={() => setOpen(true)}>Canvas</div>
    </CanvasContextMenu>;
}

// These checks cover state and keyboard contracts. CSS geometry and collision behavior
// are verified in Chrome; jsdom does not provide a browser layout engine.
const openMenu = () => document.querySelector('[data-slot="context-menu-content"][data-state="open"]');
const menuItem = name => Array.from(document.querySelectorAll('[role="menu"][data-state="open"] [role="menuitem"]'))
    .find(element => element.textContent.trim().startsWith(name));
const open = () => fireEvent.contextMenu(document.querySelector('[data-testid="canvas"]'), { clientX: 400, clientY: 300 });

it('keeps the menu open on pointer leave and navigates grouped node actions with the keyboard', () => {
    const addNode = vi.fn();
    render(<Harness onAddNode={addNode} />);
    open();
    const menu = openMenu();
    expect(menu.getAttribute('aria-label')).toBe('画布菜单');
    expect(menu.closest('[data-radix-popper-content-wrapper]')).toBeTruthy();
    fireEvent.mouseLeave(menu);
    expect(menu.getAttribute('data-state')).toBe('open');
    const trigger = menuItem('添加节点');
    act(() => trigger.focus());
    fireEvent.keyDown(trigger, { key: 'ArrowRight' });
    expect(menuItem('文本')).toBeTruthy();
    expect(menuItem('图像对比')).toBeUndefined();
    fireEvent.click(menuItem('文本'));
    expect(addNode).toHaveBeenCalledWith('text-node');
    expect(openMenu()).toBeNull();
});

it('supports disabled history actions, menu shortcuts and Escape', () => {
    const undo = vi.fn();
    const paste = vi.fn();
    render(<Harness canUndo canPaste onUndo={undo} onPaste={paste} />);
    open();
    expect(menuItem('重做').getAttribute('data-disabled')).toBe('');
    fireEvent.keyDown(openMenu(), { key: 'z', metaKey: true });
    expect(undo).toHaveBeenCalledOnce();
    expect(openMenu()).toBeNull();
    open();
    fireEvent.click(menuItem('粘贴'));
    expect(paste).toHaveBeenCalledOnce();
    expect(openMenu()).toBeNull();
    open();
    fireEvent.keyDown(openMenu(), { key: 'Escape' });
    expect(openMenu()).toBeNull();
});

it('retains the controlled picker for connecting a port to a new node', () => {
    const addNode = vi.fn();
    render(<CanvasConnectionMenu position={{ visible: true, x: 400, y: 300 }} onOpenChange={() => {}} onAddNode={addNode} />);
    fireEvent.click(menuItem('文本'));
    expect(addNode).toHaveBeenCalledWith('text-node');
});
