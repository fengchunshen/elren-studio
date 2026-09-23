import React, { createRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NativeSelect } from '@/components/ui/native-select';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { EditorDialog } from '@/components/editor/editor-dialog';
import { applyTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { isUiShortcutTarget } from '@/lib/ui-events';

describe('shared shadcn primitives', () => {
    it('does not let Radix slider/checkbox keys invoke canvas shortcuts', () => {
        render(<><Checkbox aria-label="启用" /><Slider aria-label="缩放" /><Button>撤销</Button></>);
        expect(isUiShortcutTarget(screen.getByRole('checkbox'))).toBe(true);
        expect(isUiShortcutTarget(screen.getByRole('slider'))).toBe(true);
        expect(isUiShortcutTarget(screen.getByRole('button'))).toBe(false);
        expect(isUiShortcutTarget(document.body)).toBe(false);
    });
    it('merges density overrides without losing accessible focus styles or refs', () => {
        const ref = createRef();
        render(<Button ref={ref} variant="ghost" className="h-auto p-1 text-xs">编辑</Button>);
        expect(ref.current).toBe(screen.getByRole('button'));
        expect(ref.current.className).not.toMatch(/\bh-9\b|\bpx-4\b|\bpy-2\b/);
        expect(ref.current.className).toContain('focus-visible:ring-ring');
        expect(cn('bg-primary px-4', 'bg-muted px-2')).toBe('bg-muted px-2');
    });

    it('preserves FormData, native change events, textarea values and submit behavior', async () => {
        const user = userEvent.setup(), onSubmit = vi.fn();
        const inputRef = createRef();
        render(<form onSubmit={event => { event.preventDefault(); onSubmit(Object.fromEntries(new FormData(event.currentTarget))); }}>
            <Label>名称<Input ref={inputRef} name="name" required /></Label>
            <Label>说明<Textarea name="note" /></Label>
            <Label>类型<NativeSelect name="kind" defaultValue=""><option value="">请选择</option><option value="0">零</option><option value="image">图片</option></NativeSelect></Label>
            <Button type="submit">保存</Button>
        </form>);
        await user.type(screen.getByLabelText('名称'), '项目');
        await user.type(screen.getByLabelText('说明'), '内容');
        await user.selectOptions(screen.getByLabelText('类型'), '0');
        await user.click(screen.getByRole('button', { name: '保存' }));
        expect(onSubmit).toHaveBeenCalledWith({ name: '项目', note: '内容', kind: '0' });
        expect(inputRef.current.tagName).toBe('INPUT');
    });

    it('keeps disabled buttons inert', async () => {
        const onClick = vi.fn();
        render(<Button disabled onClick={onClick}>禁用</Button>);
        await userEvent.click(screen.getByRole('button'));
        expect(onClick).not.toHaveBeenCalled();
    });

    it('toggles controlled checkboxes and switches with labels and keyboard', async () => {
        function Controls() {
            const [checked, setChecked] = useState(false), [enabled, setEnabled] = useState(false);
            return <><Label>复选<Checkbox checked={checked} onCheckedChange={setChecked} /></Label><Label>开关<Switch checked={enabled} onCheckedChange={setEnabled} /></Label></>;
        }
        const user = userEvent.setup();
        render(<Controls />);
        await user.click(screen.getByText('复选'));
        expect(screen.getByRole('checkbox').getAttribute('aria-checked')).toBe('true');
        await user.click(screen.getByText('开关'));
        expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true');
        screen.getByRole('checkbox').focus();
        await user.keyboard(' ');
        expect(screen.getByRole('checkbox').getAttribute('aria-checked')).toBe('false');
    });

    it('changes slider values using the array-based contract', () => {
        const onChange = vi.fn();
        render(<Slider defaultValue={[5]} min={1} max={30} onValueChange={onChange} aria-label="撤销步数" />);
        fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowRight' });
        expect(onChange).toHaveBeenCalledWith([6]);
    });
});

describe('overlays and theme', () => {
    it('closes editor dialogs with Escape and returns focus to the initiating control', async () => {
        function Example() {
            const [open, setOpen] = useState(false);
            return <><Button onClick={() => setOpen(true)}>配置</Button><EditorDialog isOpen={open} onClose={() => setOpen(false)} title="模型配置"><Input aria-label="模型名称" /></EditorDialog></>;
        }
        const user = userEvent.setup();
        render(<Example />);
        const trigger = screen.getByRole('button', { name: '配置' });
        await user.click(trigger);
        expect(screen.getByRole('dialog').getAttribute('aria-modal')).toBe('true');
        expect(screen.getByRole('heading', { name: '模型配置' })).toBeTruthy();
        await user.keyboard('{Escape}');
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        await waitFor(() => expect(document.activeElement).toBe(trigger));
    });

    it('keeps Tab focus inside the dialog', async () => {
        const user = userEvent.setup();
        render(<><Button>外部</Button><EditorDialog isOpen onClose={() => {}} title="编辑"><Input aria-label="内容" /></EditorDialog></>);
        const dialog = screen.getByRole('dialog');
        for (let i = 0; i < 6; i++) {
            await user.tab();
            expect(dialog.contains(document.activeElement)).toBe(true);
        }
    });

    it('supports keyboard selection and closes menus', async () => {
        const select = vi.fn(), user = userEvent.setup();
        render(<DropdownMenu><DropdownMenuTrigger asChild><Button>账户</Button></DropdownMenuTrigger><DropdownMenuContent><DropdownMenuItem onSelect={select}>项目</DropdownMenuItem></DropdownMenuContent></DropdownMenu>);
        screen.getByRole('button').focus();
        await user.keyboard('{ArrowDown}');
        await waitFor(() => expect(screen.getByRole('menuitem')).toBe(document.activeElement));
        await user.keyboard('{Enter}');
        expect(select).toHaveBeenCalledTimes(1);
        await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    });

    it('switches all theme roots, including body-level portals, without stale dark classes', () => {
        applyTheme('dark');
        expect(document.documentElement.classList.contains('dark')).toBe(true);
        applyTheme('solarized');
        expect(document.documentElement.classList.contains('dark')).toBe(false);
        expect(document.documentElement.classList.contains('theme-solarized')).toBe(true);
        applyTheme('light');
        expect(document.documentElement.classList.contains('theme-solarized')).toBe(false);
        applyTheme('unknown');
        expect(document.documentElement.classList.contains('theme-dark')).toBe(true);
    });
});
