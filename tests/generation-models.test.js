import { expect, it } from 'vitest';
import { editorModels, setPlatformContext } from '@/services/platformContext';
import { modelBadges, modelOptions, modelSelectionPatch, modelsForNode } from '@/lib/generation-models';

it('filters by node operation instead of mixing all image/video capabilities', () => {
    const models = ['image.generate', 'image.edit', 'image.relight', 'video.generate', 'video.avatar', 'video.edit', 'text.generate', 'audio.generate', 'model.generate']
        .map(operation => ({ id: operation, platformOperation: operation }));
    expect(modelsForNode(models, 'gen-image').map(item => item.id)).toEqual(['image.generate', 'image.edit']);
    expect(modelsForNode(models, 'generate-character-video').map(item => item.id)).toEqual(['video.generate']);
    expect(modelsForNode(models, 'video-avatar').map(item => item.id)).toEqual(['video.avatar']);
    expect(modelsForNode(models, 'text-node').map(item => item.id)).toEqual(['text.generate']);
    expect(modelsForNode(models, 'gen-audio').map(item => item.id)).toEqual(['audio.generate']);
    expect(modelsForNode(models, 'gen-model').map(item => item.id)).toEqual(['model.generate']);
    expect(modelsForNode([{ type: 'Video', enabled: false }], 'gen-video')).toEqual([]);
    expect(modelsForNode([{ type: 'Video', disabled: true }], 'gen-video')).toEqual([]);
});

it('does not invent resolutions or duration capabilities for platform models', () => {
    setPlatformContext({ models: [{ id: 'voice', name: 'Voice', operation: 'audio.generate', parameters: {}, inputs: { audioPurpose: 'speech' } }] });
    try {
        const [model] = editorModels();
        expect(model.resolutions).toEqual([]);
        expect(model.durations).toEqual([]);
        expect(modelOptions(model, 'ratio', ['16:9'])).toEqual([]);
        expect(modelBadges(model)).toEqual(['配音']);
    } finally { setPlatformContext(null); }
});

it('resets unsupported specs and old private parameters while retaining valid common specs', () => {
    const model = { id: 'new-video', platformOperation: 'video.generate', customParams: [
        { name: 'aspect_ratio', values: ['16:9', '9:16'], defaultValue: '16:9' },
        { name: 'resolution', values: ['720P'], defaultValue: '720P' },
        { name: 'duration', type: 'integer', values: ['5', '10'], defaultValue: 5 },
        { name: 'sound', type: 'boolean', defaultValue: false },
    ] };
    const patch = modelSelectionPatch(model, { ratio: '9:16', resolution: '4K', duration: '8s', useFirstLastFrame: true, customParams: { voice_id: 'old', resolution: '4K' } });
    expect(patch).toMatchObject({ model: 'new-video', ratio: '9:16', resolution: '720P', duration: '5', useFirstLastFrame: false, concurrentImages: 1 });
    expect(patch.customParams).toEqual({ aspect_ratio: '9:16', resolution: '720P', duration: 5, sound: false });
    expect(patch).not.toHaveProperty('prompt');
    expect(patch).not.toHaveProperty('referenceImages');
    expect(modelBadges(model)).toEqual(['720P', '5–10s']);
});

it('preserves bounded duration and maps size without retaining stale size on the next switch', () => {
    const model = { id: 'range', platformOperation: 'video.generate', customParams: [
        { name: 'duration', type: 'integer', min: 4, max: 15, defaultValue: 5 },
        { name: 'size', values: ['1024x1024'], defaultValue: '1024x1024' },
    ] };
    expect(modelSelectionPatch(model, { duration: '8s' })).toMatchObject({ duration: '8', size: '1024x1024' });
    expect(modelSelectionPatch(model, { duration: '80s' }).duration).toBe('5');
    expect(modelSelectionPatch({ id: 'plain', platformOperation: 'image.generate' }, { size: '1024x1024' }).size).toBe('');
});
