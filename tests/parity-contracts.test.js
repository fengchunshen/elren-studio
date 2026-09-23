import { describe, expect, it } from 'vitest';
import { connectNodeSources, connectionError } from '@/lib/node-io';
import { promptToken, resolvePromptReferences } from '@/lib/prompt-references';
import { videoEditRequest } from '@/lib/video-edit';
import { timelineSegments, timelinePosition } from '@/lib/timeline';
import { instantiateWorkflow, collectCanvasAssets } from '@/lib/workspace-library';

describe('parity input contracts', () => {
    it('connects every selected source once and rejects incompatible or single-slot batches atomically', () => {
        const image = { id: 'i', type: 'input-image' }, text = { id: 't', type: 'text-node' }, audio = { id: 'a', type: 'audio-input' };
        expect(connectNodeSources([], [image, text, image], { id: 'out', type: 'gen-image' }).connections.map(c => c.from)).toEqual(['i', 't']);
        expect(connectNodeSources([], [image, audio], { id: 'out', type: 'gen-image' })).toMatchObject({ connections: [], error: expect.any(String) });
        expect(connectNodeSources([], [image, { ...image, id: 'i2' }], { id: 'out', type: 'image-process' })).toMatchObject({ connections: [], error: expect.any(String) });
        expect(connectionError({ id: 'v', type: 'video-input' }, text)).toBeTruthy();
        expect(connectionError({ id: 'v', type: 'video-input', frames: [{ url: 'x.png' }] }, text)).toBeNull();
        expect(connectionError(image, { id: '3d', type: 'three-studio' })).toBeTruthy();
    });
    it('resolves only selected tokens, includes text and roles, and preserves snapshots through template cloning', () => {
        const first = { id: 'a', label: '产品', role: 'first_frame', resources: [{ type: 'image', url: 'data:image/png;base64,aaa' }, { type: 'text', text: '白色瓶身' }] };
        const other = { id: 'b', label: '不用的', resources: [{ type: 'image', url: 'unused.png' }] };
        const prompt = `${promptToken(first)} 缓慢推进 ${promptToken(first)}`;
        const result = resolvePromptReferences(prompt, [first, other]);
        expect(result.media).toHaveLength(1);
        expect(result.media[0].role).toBe('first_frame');
        expect(result.prompt).toContain('白色瓶身');
        expect(result.prompt).not.toContain('(ref:');
        const copy = instantiateWorkflow({ nodes: [{ id: 'video', type: 'gen-video', x: 0, y: 0, settings: { videoPrompt: prompt, promptReferences: [first, other] } }], connections: [] }, { x: 0, y: 0 });
        expect(resolvePromptReferences(copy.nodes[0].settings.videoPrompt, copy.nodes[0].settings.promptReferences)).toEqual(result);
        expect(() => resolvePromptReferences(prompt, [])).toThrow('丢失');
    });
    it('collects readable text as a reusable asset, without inventing a media URL', () => {
        const assets = collectCanvasAssets([{ id: 't', type: 'text-node', settings: { text: '长脚本', richText: '<p>长脚本</p>' } }], []);
        expect(assets[0]).toMatchObject({ type: 'text', text: '长脚本', richText: '<p>长脚本</p>' });
        expect(assets[0].url).toBeUndefined();
    });
    it('keeps original video, selected frame, target and replacement distinct and rejects a stale source', () => {
        const settings = { videoSourceUrl: 'original.mp4', videoSourceDuration: 5, replacementUrl: 'replacement.png', videoTarget: { time: 2, frame: 'frame.png', box: { x: 0.1, y: 0.2, width: 0.4, height: 0.3 } } };
        const media = [{ type: 'video', url: 'original.mp4' }, { type: 'image', url: 'replacement.png' }];
        const result = videoEditRequest('video.replace', settings, media);
        expect(result.references.map(item => item.role)).toEqual(['source', 'target_frame', 'replacement']);
        expect(result.videoEdit.target).toEqual({ time: 2, box: settings.videoTarget.box });
        expect(() => videoEditRequest('video.replace', settings, [{ type: 'video', url: 'different.mp4' }])).toThrow('当前原片');
        expect(() => videoEditRequest('video.replace', { ...settings, videoTarget: { ...settings.videoTarget, box: null } }, media)).toThrow('圈选');
    });
    it('rejects overlapping retakes and preserves extension direction', () => {
        const settings = { videoSourceUrl: 'source.mp4', videoSourceDuration: 10, retakeShots: [{ start: 0, end: 4, prompt: '正面' }, { start: 3, end: 5, prompt: '侧面' }] }, media = [{ type: 'video', url: 'source.mp4' }];
        expect(() => videoEditRequest('video.retake', settings, media)).toThrow('不能重叠');
        expect(videoEditRequest('video.extend', { ...settings, videoExtension: { direction: 'before', duration: 3 } }, media).videoEdit.extension).toEqual({ direction: 'before', duration: 3 });
    });
    it('maps one continuous playhead to trimmed source offsets and exact clip boundaries', () => {
        const clips = timelineSegments([{ id: 'a', start: 2, end: 5 }, { id: 'b', start: 7, end: 10 }]);
        expect(timelinePosition(clips, 1)).toEqual({ index: 0, sourceTime: 3 });
        expect(timelinePosition(clips, 3)).toEqual({ index: 1, sourceTime: 7 });
        expect(timelinePosition(clips, 6)).toEqual({ index: 1, sourceTime: 9.999 });
        expect(timelineSegments([{ id: 'bad', start: 3, end: 1 }])[0].valid).toBe(false);
    });
});

it('emits returned audio text once and respects edited, removed and disabled captions', async () => {
    const { audioCaptionUpdate } = await import('@/lib/audio-captions');
    const source = { id: 'audio', type: 'gen-audio', x: 0, y: 0, width: 400, height: 180, settings: {} };
    const task = { id: 'task', operation: 'audio.generate', source: { node_id: 'audio' }, status: 'succeeded', created_at: 1, result: { text: '真实返回字幕' } };
    const first = audioCaptionUpdate([source], task);
    expect(first.nodes).toHaveLength(2);
    expect(first.connection).toMatchObject({ from: 'audio', to: 'subtitle-task' });
    const edited = first.nodes.map(node => node.id === 'subtitle-task' ? { ...node, settings: { text: '手工编辑' } } : node);
    expect(audioCaptionUpdate(edited, task).nodes).toBe(edited);
    expect(audioCaptionUpdate(first.nodes.slice(0, 1), task).nodes).toHaveLength(1);
    expect(audioCaptionUpdate([{ ...source, settings: { autoCaption: false } }], task).nodes).toHaveLength(1);
});
