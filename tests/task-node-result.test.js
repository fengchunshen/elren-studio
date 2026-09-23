import { expect, it } from 'vitest';
import { applyTaskNodeResult } from '@/lib/task-node-result';
import { nodeText } from '@/lib/node-io';

it('keeps provider subtitles available to downstream nodes with the audio result', () => {
    const node = { id: 'audio', type: 'gen-audio', settings: {} };
    const result = applyTaskNodeResult(node, { id: 'task', source: { node_id: 'audio' }, operation: 'audio.generate', status: 'succeeded', created_at: 10, result: { text: '字幕第一行', assets: [{ url: '/audio.wav' }] } });
    expect(result.content).toBe('/audio.wav');
    expect(nodeText(result)).toEqual(['字幕第一行']);
});
it('does not overwrite edited generated text when completed tasks are restored', () => {
    const task = { id: 'task', source: { node_id: 'text' }, operation: 'text.generate', status: 'succeeded', created_at: 10, result: { text: '初稿' } };
    const result = applyTaskNodeResult({ id: 'text', settings: {} }, task);
    const edited = { ...result, settings: { ...result.settings, text: '手工修改', richText: '<p>手工修改</p>' } };
    expect(applyTaskNodeResult(edited, task)).toBe(edited);
    expect(applyTaskNodeResult(edited, { ...task, id: 'older', created_at: 9 })).toBe(edited);
});
