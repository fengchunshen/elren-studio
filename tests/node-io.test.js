import { describe, expect, it } from 'vitest';
import { connectNodes, connectionPort, nodeMedia, nodeText, mediaType } from '@/lib/node-io';

describe('workflow data boundaries', () => {
    it('reads manually edited text and keeps video source separate from extracted frames', () => {
        expect(nodeText({ type: 'text-node', settings: { text: '手工脚本' } })).toEqual(['手工脚本']);
        expect(nodeText({ type: 'novel-input', settings: { content: '长篇脚本' } })).toEqual(['长篇脚本']);
        expect(nodeMedia({ type: 'video-input', content: 'movie.mp4', selectedKeyframes: [{ url: 'frame.png' }] })).toEqual([
            { type: 'video', url: 'movie.mp4', role: 'source' }, { type: 'image', url: 'frame.png', role: 'frame' },
        ]);
        expect(mediaType('audio', '/asset/opaque')).toBe('audio');
        expect(mediaType('unsupported', '/asset/opaque')).toBeNull();
    });
    it('rejects text-to-image comparison and a reverse connection to a source-only node', () => {
        const text = { id: 't', type: 'text-node' }, image = { id: 'i', type: 'input-image' }, compare = { id: 'c', type: 'image-compare' };
        expect(connectNodes([], text, compare).error).toBeTruthy();
        expect(connectNodes([], text, image).error).toBeTruthy();
        expect(connectNodes([], image, compare).connections[0].inputType).toBe('imageA');
    });
    it('replacing B preserves A, including comparison links created before slot IDs existed', () => {
        const compare = { id: 'c', type: 'image-compare' };
        const old = [{ id: 'a', from: 'i1', to: 'c' }, { id: 'b', from: 'i2', to: 'c' }];
        expect(old.map(link => connectionPort(link, old, compare))).toEqual(['imageA', 'imageB']);
        const updated = connectNodes(old, { id: 'i3', type: 'input-image' }, compare, 'imageB').connections;
        expect(updated.map(link => [link.from, link.inputType])).toEqual([['i1', 'imageA'], ['i3', 'imageB']]);
        expect(connectNodes(updated, { id: 'i3', type: 'input-image' }, compare, 'imageB').connections).toBe(updated);
    });
    it('forwards selected character and scene images through the same media contract', () => {
        for (const type of ['generate-character-image', 'generate-scene-image']) {
            expect(nodeMedia({ type, settings: { imageUrls: ['one.png', 'two.png'], selectedImageIndex: 1 } })[0].url).toBe('two.png');
        }
        expect(nodeMedia({ type: 'generate-character-video', content: 'actor.mp4' })[0].type).toBe('video');
    });
});
