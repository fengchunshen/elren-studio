import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { centeredCrop, dragCrop } from '@/lib/image-crop';
import { describeReference, removeSourceReferences, removedPromptSources } from '@/lib/canvas-references';
import { nodePreview, previewMetadata } from '@/lib/node-preview';
import { promptToken, uniqueReferenceMedia } from '@/lib/prompt-references';
import { ImageCropEditor } from '@/components/editor/image-crop-editor';
import { GenerationInspector } from '@/components/editor/generation-node';
import { ReferencePicker } from '@/components/editor/reference-picker';
vi.mock('@/lib/image-processing', () => ({ loadImage: vi.fn(async url => ({ src: url, naturalWidth: 2048, naturalHeight: 1024 })) }));
afterEach(cleanup);
const source = { id: 'blue', title: '蓝杯原图', type: 'gen-image', content: '/blue.png' };
const target = { id: 'edit', type: 'gen-image', settings: {} };
it('keeps pending sources unavailable but allows an old result during regeneration', () => {
    expect(describeReference({ ...source, content: '' }, target, 'default', { status: 'reconciling' })).toMatchObject({ ready: false, status: '结果待核对' });
    expect(describeReference(source, target, 'default', { status: 'generating' })).toMatchObject({ ready: true, thumbnail: '/blue.png' });
    expect(describeReference({ id: 'txt', type: 'text-node', settings: { text: '产品要求' } }, target).ready).toBe(true);
});
it('removing a source removes only matching tokens and legacy images, with identity surviving a new source result', () => {
    const ref = { id: 'r1', sourceNodeId: 'blue', label: '蓝杯原图', resources: [{ type: 'image', url: '/old-blue.png' }] };
    const other = { id: 'r2', label: '背景', resources: [{ type: 'image', url: '/background.png' }] };
    const settings = { prompt: `${promptToken(ref)} 改色 ${promptToken(other)}`, promptReferences: [ref, other], referenceImages: ['/blue.png', '/background.png'] };
    const result = removeSourceReferences(settings, [source]);
    expect(result.prompt).toBe(` 改色 ${promptToken(other)}`);
    expect(result.promptReferences).toEqual([other]);
    expect(result.referenceImages).toEqual(['/background.png']);
    expect(removedPromptSources(settings, { prompt: result.prompt }, [source])).toEqual([source]);
});
it('constrains crop moves and ratio resizing within the image', () => {
    const box = centeredCrop(2048, 1024, 1);
    expect(box).toEqual({ x: 512, y: 0, width: 1024, height: 1024 });
    expect(dragCrop(box, 5000, 5000, 'move', { width: 2048, height: 1024 })).toEqual({ x: 1024, y: 0, width: 1024, height: 1024 });
    const resized = dragCrop(box, -400, -400, 'se', { width: 2048, height: 1024 }, 1);
    expect(resized.width).toBe(resized.height);
    expect(resized.x + resized.width).toBeLessThanOrEqual(2048);
});
it('does not guess preview metadata or attach another task to an edited image', () => {
    const history = [{ sourceNodeId: 'blue', url: '/old.png', width: 99, height: 22, startTime: 100 }];
    const preview = nodePreview(source, '/blue.png', history);
    expect(preview.width).toBeUndefined();
    expect(preview.startTime).toBeUndefined();
    expect(previewMetadata(preview)).toBe('');
    expect(previewMetadata(preview, { width: 2048, height: 2048 })).toBe('2048 × 2048');
    expect(preview.previewOrigin).toBe('canvas');
});
it('starts crop with the entire source and produces nothing when cancelled', async () => {
    const confirm = vi.fn(), close = vi.fn();
    render(<ImageCropEditor name="蓝杯原图" source="/blue.png" resolveUrl={async url => url} onConfirm={confirm} onClose={close} />);
    expect((await screen.findByLabelText('裁剪尺寸')).textContent).toBe('2048 × 1024');
    fireEvent.click(screen.getByRole('button', { name: '取消', exact: true }));
    expect(close).toHaveBeenCalledTimes(1);
    expect(confirm).not.toHaveBeenCalled();
});
it('confirms the current crop rather than the default 512 square', async () => {
    const confirm = vi.fn();
    render(<ImageCropEditor name="蓝杯原图" source="/blue.png" resolveUrl={async url => url} onConfirm={confirm} onClose={vi.fn()} />);
    await screen.findByLabelText('裁剪尺寸');
    fireEvent.keyDown(screen.getByRole('button', { name: '调整裁剪右边' }), { key: 'ArrowLeft', shiftKey: true });
    fireEvent.click(screen.getByRole('button', { name: '确认裁剪' }));
    await waitFor(() => expect(confirm).toHaveBeenCalledWith({ x: 0, y: 0, width: 2038, height: 1024 }));
});

it('searches reference thumbnails and keeps pending and connected entries inspectable', async () => {
    const select = vi.fn();
    render(<ReferencePicker targetLabel="改色" candidates={[
        describeReference(source, target),
        describeReference({ id: 'pending', title: '等待中的图片', type: 'gen-image' }, target, 'default', { status: 'generating' }),
    ]} connectedIds={['blue']} onSelect={select} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '参考列表' }));
    expect((await screen.findByRole('img', { name: '蓝杯原图' })).getAttribute('src')).toBe('/blue.png');
    expect(screen.getByRole('button', { name: /等待中的图片/ }).disabled).toBe(false);
    expect(screen.getByRole('button', { name: /等待中的图片/ }).textContent).toContain('查看节点');
    expect(screen.getByRole('button', { name: /蓝杯原图.*已连接/ }).disabled).toBe(false);
    expect(screen.getByRole('button', { name: /蓝杯原图.*已连接/ }).textContent).toContain('返回编辑');
    fireEvent.change(screen.getByRole('textbox', { name: '搜索参考' }), { target: { value: '等待' } });
    expect(screen.queryByRole('img', { name: '蓝杯原图' })).toBeNull();
    expect(select).not.toHaveBeenCalled();
});

it('deduplicates the same image from a connection and a token while preserving frame roles', () => {
    const image = { url: '/blue.png', type: 'image', role: 'reference' };
    expect(uniqueReferenceMedia([image, { ...image }, { ...image, role: 'first_frame' }])).toEqual([image, { ...image, role: 'first_frame' }]);
});
it('blocks generation before submission when a connected reference has no result', () => {
    const props = { node: { ...target, settings: { model: 'm', prompt: '改色' } }, models: [{ id: 'm', type: 'Image' }], textInput: '', onChange: vi.fn(), onRun: vi.fn() };
    const reference = { ...describeReference({ ...source, content: '' }, target, 'default', { status: 'reconciling' }), sourceNodeId: source.id };
    const { rerender } = render(<GenerationInspector {...props} references={[reference]} />);
    expect(screen.getByRole('button', { name: '开始生成' }).disabled).toBe(true);
    expect(screen.getByRole('status').textContent).toContain('结果待核对');
    rerender(<GenerationInspector {...props} references={[]} />);
    expect(screen.getByRole('button', { name: '开始生成' }).disabled).toBe(false);
});
