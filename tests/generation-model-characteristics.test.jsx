import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { GenerationModelPicker } from '@/components/editor/generation-model-picker';
import { editorModels, setPlatformContext } from '@/services/platformContext';

it('shows server-declared Chinese model characteristics in choices and selection', async () => {
    setPlatformContext({ models: [
        { id: 'flare', name: 'GPT Image 2.5 Flare', operation: 'image.edit', tags: ['快速生成'], description: '适合日常创作，快速生成高质量图片。', parameters: { size: { type: 'string', enum: ['auto'], default: 'auto', hidden: true } }, inputs: { types: ['image'], max: 4 } },
        { id: 'sunburst', name: 'GPT Image 2.5 Sunburst', operation: 'image.edit', tags: ['精细编辑'], description: '适合参考图精修，注重修改准确性。', parameters: {}, inputs: { types: ['image'], max: 4 } },
    ] });
    const models = editorModels(), change = vi.fn(), user = userEvent.setup();
    expect(models[0].customParams).toEqual([]);
    const { rerender } = render(<GenerationModelPicker models={models} value="flare" onChange={change} />);
    expect(screen.getByRole('button', { name: '生成模型' }).textContent).toContain('快速生成');
    await user.click(screen.getByRole('button', { name: '生成模型' }));
    const option = screen.getByRole('menuitemradio', { name: /Sunburst/ });
    expect(within(option).getByText('精细编辑')).toBeTruthy();
    expect(within(option).queryByText('适合参考图精修，注重修改准确性。')).toBeNull();
    expect(option.getAttribute('aria-description')).toBe('适合参考图精修，注重修改准确性。');
    expect(within(option).queryByText('图片参考')).toBeNull();
    expect(within(option).queryByText('图片编辑')).toBeNull();
    await user.click(option);
    expect(change).toHaveBeenCalledTimes(1);
    expect(change).toHaveBeenLastCalledWith('sunburst');
    rerender(<GenerationModelPicker models={models} value="sunburst" onChange={change} />);
    expect(screen.getByRole('button', { name: '生成模型' }).textContent).toContain('精细编辑');
    expect(screen.queryByText('管理模型')).toBeNull();
    setPlatformContext(null);
});
