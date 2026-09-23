import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { TextGenerationInspector } from '@/components/editor/text-node';

it('offers model configuration instead of an empty native menu and keeps generation disabled', async () => {
    const onSettings = vi.fn(), onRun = vi.fn();
    render(<TextGenerationInspector node={{ settings: { generationPrompt: '一段产品文案' } }} models={[]} onChange={() => {}} onSettings={onSettings} onRun={onRun} />);
    fireEvent.click(screen.getByRole('button', { name: '配置文字模型' }));
    expect(onSettings).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: '生成文本' }).disabled).toBe(true);
    expect(document.querySelector('select')).toBeNull();
    expect(onRun).not.toHaveBeenCalled();
});

it('selects a text model from the shared menu and submits only after a request is entered', async () => {
    const onRun = vi.fn(async () => {}), onChange = vi.fn();
    function Harness() {
        const [settings, setSettings] = useState({});
        return <TextGenerationInspector node={{ settings }} models={[{ id: 'text-model', name: '文字模型 A' }]} onSettings={() => {}} onRun={onRun}
            onChange={patch => { onChange(patch); setSettings(previous => ({ ...previous, ...patch })); }} />;
    }
    render(<Harness />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '文本模型' }));
    await user.click(screen.getByRole('menuitemradio', { name: '文字模型 A' }));
    expect(onChange).toHaveBeenCalledWith({ model: 'text-model' });
    expect(screen.getByRole('button', { name: '生成文本' }).disabled).toBe(true);
    fireEvent.change(screen.getByRole('textbox', { name: '文本创作要求' }), { target: { value: '一段产品文案' } });
    expect(onChange).toHaveBeenLastCalledWith({ generationPrompt: '一段产品文案' });
    await user.click(screen.getByRole('button', { name: '生成文本' }));
    expect(onRun).toHaveBeenCalledOnce();
}, 40000);
