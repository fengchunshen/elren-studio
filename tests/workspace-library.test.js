import { expect, it } from 'vitest';
import { BUILTIN_WORKFLOWS, collectCanvasAssets, filterCanvasNodes, instantiateWorkflow, readLibraryMediaFile } from '@/lib/workspace-library';

it('searches titles, prompts, text and storyboard descriptions with type filters', () => {
    const nodes = [
        { id: 'image', type: 'gen-image', title: '产品海报', settings: { prompt: '森林 香水' } },
        { id: 'text', type: 'text-node', settings: { text: 'FOREST 脚本' } },
        { id: 'shots', type: 'storyboard-node', settings: { shots: [{ description: '香水 特写' }] } },
    ];
    expect(filterCanvasNodes(nodes, '森林 香水', 'image').map(node => node.id)).toEqual(['image']);
    expect(filterCanvasNodes(nodes, 'forest', 'text').map(node => node.id)).toEqual(['text']);
    expect(filterCanvasNodes(nodes, '香水', 'tool').map(node => node.id)).toEqual(['shots']);
    expect(filterCanvasNodes(nodes, '不存在')).toEqual([]);
});

it('deduplicates media across nodes and generation history while preserving text as a separate non-media asset', () => {
    const assets = collectCanvasAssets([
        { id: 'text', type: 'text-node', content: 'not an asset' },
        { id: 'image', type: 'input-image', content: '/hero.png' },
        { id: 'video', type: 'preview', previewType: 'video', content: '/video.mp4' },
    ], [{ id: 'history', type: 'image', url: '/hero.png', output_images: ['/hero.png', '/other.png'] }]);
    expect(assets.filter(asset => asset.type !== 'text').map(asset => asset.url)).toEqual(['/hero.png', '/video.mp4', '/other.png']);
    expect(assets.find(asset => asset.type === 'video').url).toBe('/video.mp4');
    expect(assets.find(asset => asset.type === 'text')).toMatchObject({ text: 'not an asset' });
});

it('instantiates templates with fresh IDs, complete internal connections and centered relative layout', () => {
    const workflow = BUILTIN_WORKFLOWS[0];
    const copy = instantiateWorkflow(workflow, { x: 200, y: 300 }, { 'gen-image': 'available-model' });
    expect(copy.nodes).toHaveLength(4);
    expect(copy.connections).toHaveLength(3);
    const ids = new Set(copy.nodes.map(node => node.id));
    expect(ids.size).toBe(4);
    expect(copy.connections.every(connection => ids.has(connection.from) && ids.has(connection.to))).toBe(true);
    expect(copy.nodes[1].y - copy.nodes[0].y).toBe(340);
    expect(copy.nodes[2].settings.model).toBe('available-model');
    copy.nodes[0].settings.example = 'changed';
    expect(workflow.nodes[0].settings.example).toBeUndefined();
    const second = instantiateWorkflow(workflow, { x: 200, y: 300 });
    expect(second.nodes.every(node => !ids.has(node.id))).toBe(true);
});

it('rejects broken templates instead of inserting a partial workflow', () => {
    const base = { nodes: [{ id: 'a', type: 'text-node', x: 0, y: 0, width: 300, height: 200 }], connections: [{ from: 'a', to: 'missing' }] };
    expect(() => instantiateWorkflow(base, { x: 0, y: 0 })).toThrow('模板连线缺少对应节点');
    expect(() => instantiateWorkflow({ nodes: [{ id: 'a', type: 'unknown', x: 0, y: 0 }] }, { x: 0, y: 0 })).toThrow('不支持');
});
it('clears rendering jobs and remaps clip sources when a timeline is reused', () => {
    const workflow = { nodes: [
        { id: 'source', type: 'video-input', x: 0, y: 0 },
        { id: 'timeline', type: 'video-timeline', x: 400, y: 0, settings: { mediaJobId: 'old-job', renderedJobId: 'old-job', clips: [{ id: 'old-clip', nodeId: 'source', url: 'scene.mp4', start: 1, end: 3 }] } },
    ], connections: [{ from: 'source', to: 'timeline' }] };
    const copy = instantiateWorkflow(workflow, { x: 0, y: 0 });
    expect(copy.nodes[1].settings.mediaJobId).toBeUndefined();
    expect(copy.nodes[1].settings.clips[0].nodeId).toBe(copy.nodes[0].id);
    expect(copy.nodes[1].settings.clips[0].id).not.toBe('old-clip');
    expect(() => instantiateWorkflow({ nodes: [{ id: 'a', type: 'text-node', x: 0, y: 0 }, { id: 'b', type: 'image-compare', x: 300, y: 0 }], connections: [{ from: 'a', to: 'b' }] }, { x: 0, y: 0 })).toThrow('不兼容');
});

it('reads uploaded media into a durable library record and preserves filename, type and folder', async () => {
    const file = new File(['image bytes'], '参考图.png', { type: 'image/png' });
    const asset = await readLibraryMediaFile(file, '角色');
    expect(asset).toMatchObject({ kind: 'asset', name: '参考图.png', type: 'image', folder: '角色', favorite: false });
    expect(asset.url).toBe('data:image/png;base64,aW1hZ2UgYnl0ZXM=');
    const video = await readLibraryMediaFile(new File(['video'], '镜头.mp4', { type: 'video/mp4' }));
    expect(video.type).toBe('video');
    expect(video.folder).toBe('其他');
    const audio = await readLibraryMediaFile(new File(['audio'], '旁白.wav', { type: 'audio/wav' }));
    expect(audio).toMatchObject({ type: 'audio', name: '旁白.wav' });
    expect(audio.url.startsWith('data:audio/wav;base64,')).toBe(true);
    await expect(readLibraryMediaFile(new File(['text'], 'notes.txt', { type: 'text/plain' }))).rejects.toThrow('仅支持图片、视频、音频和 GLB');
});
