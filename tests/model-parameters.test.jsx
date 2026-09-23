import React from 'react';
import { expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ModelParameterFields } from '@/components/editor/model-parameter-fields';
import { operationType } from '@/services/platformContext';

it('uses the correct control for audio booleans and multiline lyrics', () => {
    const change = vi.fn();
    render(<ModelParameterFields fields={[{ name: 'instrumental', label: '纯音乐', type: 'boolean', defaultValue: true }, { name: 'lyrics', label: '歌词', multiline: true }]} values={{ lyrics: '第一行\n第二行' }} onChange={change} />);
    fireEvent.click(screen.getByRole('checkbox', { name: '纯音乐' }));
    expect(change).toHaveBeenCalledWith({ instrumental: false, lyrics: '第一行\n第二行' });
    expect(screen.getByRole('textbox', { name: '歌词' }).tagName).toBe('TEXTAREA');
});
it('does not route audio, 3D or unknown operations into video models', () => {
    expect(operationType('audio.generate')).toBe('Audio');
    expect(operationType('model.generate')).toBe('Model');
    expect(operationType('video.avatar')).toBe('Video');
    expect(operationType('unknown')).toBe('Unsupported');
});
