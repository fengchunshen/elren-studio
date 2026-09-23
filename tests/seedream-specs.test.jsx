import React, { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GenerationInspector } from '@/components/editor/generation-node';
import { editorModels, setPlatformContext } from '@/services/platformContext';
import { supportedParameters } from '@/services/taskService';
vi.mock('@/services/workspaceLibrary', () => ({ libraryScope: () => 'local', listLibraryEntries: async () => [] }));
afterEach(() => { cleanup(); setPlatformContext(null); });
const catalog = [
    { id: 'seedream', name: 'Seedream 5.0 Pro', operation: 'image.edit', parameters: {
        size: { type: 'string', enum: ['1K', '1.5K', '2K'], default: '2K' },
        ratio: { type: 'string', enum: ['auto', '1:1', '9:16', '16:9', '3:4', '4:3', '3:2', '2:3', '5:4', '4:5', '21:9'], default: 'auto' },
    }, inputs: { types: ['image'], max: 10 } },
    { id: 'limited', name: '自动规格模型', operation: 'image.edit', parameters: { size: { type: 'string', enum: ['auto'], default: 'auto', hidden: true } }, inputs: { types: ['image'], max: 4 } },
];
function Harness({ onRun = vi.fn() }) {
    const [settings, setSettings] = useState({ model: 'seedream', prompt: '保留原提示词', size: '2K', resolution: '2K', customParams: { size: '2K' } });
    return <GenerationInspector node={{ type: 'gen-image', settings }} models={editorModels()} references={[]} textInput=""
        onChange={patch => setSettings(s => ({ ...s, ...patch }))} onRun={() => onRun(supportedParameters(settings.model, { ...settings.customParams, size: settings.size, ratio: settings.ratio }))} />;
}
it('selects image quality and ratio without running, and submits their actual values', async () => {
    setPlatformContext({ models: catalog });
    const run = vi.fn(), user = userEvent.setup();
    render(<Harness onRun={run} />);
    expect(screen.getByRole('button', { name: '生成规格' }).textContent).toContain('自适应 · 2K');
    await user.click(screen.getByRole('button', { name: '生成规格' }));
    expect(screen.getByRole('button', { name: '比例 自适应' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getAllByRole('button', { name: /^比例 / })).toHaveLength(11);
    await user.click(screen.getByRole('button', { name: '画质 1.5K' }));
    await user.click(screen.getByRole('button', { name: '比例 16:9' }));
    expect(screen.getByRole('button', { name: '生成规格' }).textContent).toContain('16:9 · 1.5K');
    expect(screen.getByRole('textbox', { name: '图片提示词' }).textContent).toBe('保留原提示词');
    expect(run).not.toHaveBeenCalled();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('button', { name: '比例 16:9' })).toBeNull());
    await user.click(screen.getByRole('button', { name: '开始生成' }));
    expect(run).toHaveBeenCalledWith({ size: '1.5K', ratio: '16:9' });
}, 40000);
it('returns to adaptive sizing and clears unsupported ratio when changing models', async () => {
    setPlatformContext({ models: catalog });
    const run = vi.fn(), user = userEvent.setup();
    render(<Harness onRun={run} />);
    await user.click(screen.getByRole('button', { name: '生成规格' }));
    await user.click(screen.getByRole('button', { name: '比例 9:16' }));
    await user.click(screen.getByRole('button', { name: '比例 自适应' }));
    expect(screen.getByRole('button', { name: '生成规格' }).textContent).toContain('自适应 · 2K');
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: '生成模型' }));
    await user.click(screen.getByRole('menuitemradio', { name: /自动规格模型/ }));
    expect(screen.queryByRole('button', { name: '生成规格' })).toBeNull();
    expect(run).not.toHaveBeenCalled();
}, 40000);

it.each(['GPT Image 2', 'GPT Image 2.5 Flare', 'GPT Image 2.5 Sunburst'])('shares quality and ratio controls for %s, including restored auto settings', async name => {
    const gpt = { ...catalog[0], id: 'gpt', name, parameters: { ...catalog[0].parameters,
        quality: { type: 'string', enum: ['auto'], default: 'auto', hidden: true },
        n: { type: 'integer', enum: [1], default: 1 },
    } };
    setPlatformContext({ models: [catalog[0], gpt] });
    const run = vi.fn(), user = userEvent.setup();
    function Restored() {
        const [settings, setSettings] = useState({ model: 'gpt', resolution: 'auto', size: 'auto', prompt: '保留提示词', customParams: { size: 'auto' } });
        return <GenerationInspector node={{ type: 'gen-image', settings }} models={editorModels()} references={[]} textInput=""
            onChange={patch => setSettings(s => ({ ...s, ...patch }))}
            onRun={() => run(supportedParameters(settings.model, { ...settings.customParams, size: settings.size, ratio: settings.ratio }))} />;
    }
    render(<Restored />);
    await waitFor(() => expect(screen.getByRole('button', { name: '生成规格' }).textContent).toContain('自适应 · 2K'));
    await user.click(screen.getByRole('button', { name: '生成规格' }));
    expect(screen.getAllByRole('button', { name: /^比例 / })).toHaveLength(11);
    await user.click(screen.getByRole('button', { name: '画质 1.5K' }));
    await user.click(screen.getByRole('button', { name: '比例 16:9' }));
    expect(screen.getByRole('textbox', { name: '图片提示词' }).textContent).toBe('保留提示词');
    expect(run).not.toHaveBeenCalled();
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: '开始生成' }));
    expect(run).toHaveBeenCalledWith({ size: '1.5K', ratio: '16:9', quality: 'auto', n: 1 });
    await user.click(screen.getByRole('button', { name: '生成模型' }));
    await user.click(screen.getByRole('menuitemradio', { name: /Seedream 5.0 Pro/ }));
    expect(screen.getByRole('button', { name: '生成规格' }).textContent).toContain('16:9 · 1.5K');
}, 40000);
