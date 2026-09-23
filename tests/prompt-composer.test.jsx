import React, { StrictMode, useState } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { PromptComposer } from '@/components/editor/prompt-composer';
import { RichTextBody } from '@/components/editor/text-node';
import { promptToken } from '@/lib/prompt-references';
vi.mock('@/services/workspaceLibrary', () => ({ libraryScope: () => 'local', listLibraryEntries: async () => [] }));

it('restores rich text and readable reference atoms in StrictMode without exposing storage IDs', async () => {
    const ref = { id: 'restored-reference', label: '香水', role: 'reference', resources: [{ type: 'text', text: '白色瓶身' }] };
    function Harness() {
        const [value, setValue] = useState(`${promptToken(ref)} 保持一致`), [references, setReferences] = useState([ref]);
        return <><RichTextBody node={{ id: 'text', settings: { text: '脚本', richText: '<p>脚本</p>' } }} selected={false} onChange={() => {}} /><PromptComposer value={value} references={references} aria-label="图片提示词" onChange={(value, refs) => { setValue(value); setReferences(refs); }} /></>;
    }
    render(<StrictMode><Harness /></StrictMode>);
    await waitFor(() => expect(screen.getByRole('textbox', { name: '脚本正文' }).textContent).toBe('脚本'));
    await waitFor(() => expect(screen.getByRole('textbox', { name: '图片提示词' }).textContent).toBe('@香水 保持一致'));
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '@香水' }));
    await user.click(screen.getByRole('button', { name: '移除引用' }));
    await waitFor(() => expect(screen.getByRole('textbox', { name: '图片提示词' }).textContent).toBe(' 保持一致'));
    expect(screen.queryByRole('button', { name: '@香水' })).toBeNull();
});

it('opens suggestions outside the composer without taking focus and inserts a command in place', async () => {
    function Harness() {
        const [value, setValue] = useState('');
        return <section aria-label="编辑面板"><PromptComposer kind="video" value={value} aria-label="视频提示词" onChange={setValue} /><button type="button">生成参数</button></section>;
    }
    render(<Harness />);
    const user = userEvent.setup();
    const input = await screen.findByRole('textbox', { name: '视频提示词' });
    // jsdom does not implement caret geometry; exercise the keyboard path without pointer hit testing.
    const rect = { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 };
    const oldRects = Range.prototype.getClientRects, oldBounds = Range.prototype.getBoundingClientRect;
    Range.prototype.getClientRects = () => [rect];
    Range.prototype.getBoundingClientRect = () => rect;
    try {
    act(() => input.focus());
    await user.keyboard('/');
    const list = await screen.findByRole('listbox', { name: '快捷指令' });
    expect(screen.getByRole('region', { name: '编辑面板' }).contains(list)).toBe(false);
    expect(document.activeElement).toBe(input);
    expect(input.getAttribute('aria-controls')).toBe(list.id);
    await user.keyboard('{Tab}');
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
    expect(input.textContent).not.toContain('/');
    expect(input.textContent.length).toBeGreaterThan(5);
    expect(document.activeElement).toBe(input);
    await user.keyboard(' /');
    expect(await screen.findByRole('listbox', { name: '快捷指令' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '生成参数' }));
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '生成参数' }));
    } finally {
        if (oldRects) Range.prototype.getClientRects = oldRects; else delete Range.prototype.getClientRects;
        if (oldBounds) Range.prototype.getBoundingClientRect = oldBounds; else delete Range.prototype.getBoundingClientRect;
    }
}, 40000);
