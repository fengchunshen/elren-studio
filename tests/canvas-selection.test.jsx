import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { selectNodesInMarquee } from '@/lib/canvas-selection';
vi.mock('@/services/apiClient', () => ({ nativeFetch: vi.fn(async () => new Response('{}', { status: 503 })), api: vi.fn(async () => ({ items: [] })), setCsrf: vi.fn() }));
vi.mock('@/services/platformContext', () => ({ platformEnabled: false, getPlatformContext: () => null, editorModels: () => [], platformModel: () => null }));
vi.mock('@/services/workspaceLibrary', () => ({ libraryScope: () => 'local', listLibraryEntries: async () => [], saveLibraryEntry: vi.fn(), removeLibraryEntry: vi.fn() }));
const nodes = [
    { id: 'a', type: 'text-node', x: 100, y: 150, width: 320, height: 240, settings: { text: '脚本甲' } },
    { id: 'b', type: 'text-node', x: 550, y: 150, width: 320, height: 240, settings: { text: '脚本乙' } },
    { id: 'c', type: 'text-node', x: 1000, y: 150, width: 320, height: 240, settings: { text: '保留' } },
];
let editor;
afterEach(() => { editor?.unmount(); vi.restoreAllMocks(); });
async function mount(initialNodes = nodes) {
    window.localStorage.clear();
    window.localStorage.setItem('elren_nodes', JSON.stringify(initialNodes));
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }) });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
        if (this.id === 'canvas-bg') return { x: 56, y: 48, left: 56, top: 48, width: 1800, height: 900, right: 1856, bottom: 948 };
        return { x: 200, y: 300, left: 200, top: 300, width: 320, height: 240, right: 520, bottom: 540 };
    });
    const { default: Editor } = await import('@/App.jsx');
    editor = render(<Editor />);
    return document.querySelector('#canvas-bg');
}
const node = id => document.querySelector(`[data-node-id="${id}"]`);
const selected = () => [...document.querySelectorAll('.node-wrapper[data-selected="true"]')].map(item => item.dataset.nodeId);
function pointer(type, x, y, movementX = 0, movementY = 0) {
    const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y });
    Object.defineProperties(event, { movementX: { value: movementX }, movementY: { value: movementY } });
    window.dispatchEvent(event);
}
function marquee(canvas, start = [140, 180], end = [940, 450], modifiers = {}) {
    fireEvent.mouseDown(canvas, { button: 0, clientX: start[0], clientY: start[1], ...modifiers });
    act(() => { pointer('pointermove', ...end); pointer('pointerup', ...end); });
    fireEvent.click(canvas, { button: 0, clientX: end[0], clientY: end[1] });
}
it('hit-tests reverse marquees under translated zoom and preserves additive sources', () => {
    expect([...selectNodesInMarquee(nodes, { x: 475, y: 220 }, { x: 75, y: 60 }, { x: 25, y: -10, zoom: 0.5 }, ['c'])]).toEqual(['c', 'a', 'b']);
    expect([...selectNodesInMarquee(nodes, { x: 0, y: 0 }, { x: 100, y: 150 }, { x: 0, y: 0, zoom: 1 })]).toEqual([]);
});
it('selects on a fast left drag, moves both nodes on the first frame, and collapses only on a click', async () => {
    const canvas = await mount();
    const transform = canvas.firstElementChild.style.transform;
    marquee(canvas);
    expect(selected()).toEqual(['a', 'b']);
    expect(canvas.firstElementChild.style.transform).toBe(transform);
    expect(screen.getByRole('toolbar', { name: '已选 2 个节点' })).toBeTruthy();
    expect(document.querySelectorAll('[data-workflow-group]')).toHaveLength(0);
    fireEvent.mouseDown(node('a'), { button: 0, clientX: 200, clientY: 250 });
    act(() => { pointer('pointermove', 240, 280, 40, 30); pointer('pointerup', 240, 280); });
    await waitFor(() => expect(node('a').style.left).toBe('140px'));
    expect(node('b').style.left).toBe('590px');
    expect(node('c').style.left).toBe('1000px');
    expect(selected()).toEqual(['a', 'b']);
    fireEvent.mouseDown(node('a'), { button: 0, clientX: 240, clientY: 280 });
    act(() => pointer('pointerup', 240, 280));
    expect(selected()).toEqual(['a']);
}, 40000);
it('supports additive selection, toggle clicks, the movement threshold and Escape during a pending frame', async () => {
    const canvas = await mount();
    marquee(canvas);
    fireEvent.mouseDown(node('c'), { button: 0, shiftKey: true });
    expect(selected()).toEqual(['a', 'b', 'c']);
    fireEvent.mouseDown(node('a'), { button: 0, metaKey: true });
    expect(selected()).toEqual(['b', 'c']);
    marquee(canvas, [140, 180], [480, 450], { shiftKey: true });
    expect(selected()).toEqual(['a', 'b', 'c']);
    fireEvent.mouseDown(canvas, { button: 0, clientX: 1400, clientY: 700 });
    act(() => pointer('pointermove', 1402, 701));
    expect(document.querySelector('#canvas-bg > .canvas-selection-box')).toBeNull();
    expect(selected()).toEqual(['a', 'b', 'c']);
    act(() => pointer('pointerup', 1402, 701));
    expect(selected()).toEqual([]);
    fireEvent.mouseDown(canvas, { button: 0, clientX: 140, clientY: 180 });
    act(() => pointer('pointermove', 940, 450));
    fireEvent.keyDown(window, { key: 'Escape' });
    await act(() => new Promise(resolve => requestAnimationFrame(resolve)));
    expect(selected()).toEqual([]);
    expect(document.querySelector('[data-canvas-selection-bounds]')).toBeNull();
}, 30000);
it('pans with Space over nodes or the middle button, preserves selection and releases Space on blur', async () => {
    const canvas = await mount();
    marquee(canvas);
    const transform = canvas.firstElementChild.style.transform;
    fireEvent.keyDown(window, { key: ' ', code: 'Space' });
    fireEvent.mouseDown(node('a'), { button: 0, clientX: 200, clientY: 250 });
    act(() => { pointer('pointermove', 240, 280, 40, 30); pointer('pointerup', 240, 280); });
    expect(canvas.firstElementChild.style.transform).not.toBe(transform);
    expect(node('a').style.left).toBe('100px');
    expect(selected()).toEqual(['a', 'b']);
    fireEvent.blur(window);
    expect(canvas.dataset.panReady).toBe('false');
    const afterSpace = canvas.firstElementChild.style.transform;
    fireEvent.mouseDown(canvas, { button: 1, clientX: 1400, clientY: 700 });
    act(() => { pointer('pointermove', 1450, 730); pointer('pointerup', 1450, 730); });
    expect(canvas.firstElementChild.style.transform).not.toBe(afterSpace);
    expect(selected()).toEqual(['a', 'b']);
    const text = document.querySelector('[contenteditable="true"]');
    fireEvent.keyDown(text, { key: ' ', code: 'Space' });
    expect(canvas.dataset.panReady).toBe('false');
}, 30000);
it('opens grouping and template forms from the public toolbar without mutating the temporary selection', async () => {
    const canvas = await mount();
    marquee(canvas);
    fireEvent.click(screen.getByRole('button', { name: '分组', exact: true }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(selected()).toEqual(['a', 'b']);
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: '保存为模板' }));
    expect(await screen.findByRole('form', { name: '保存模板' })).toBeTruthy();
    expect(selected()).toEqual(['a', 'b']);
    expect(document.querySelectorAll('[data-workflow-group]')).toHaveLength(0);
}, 30000);

it('drags generated images from their preview surface without opening a preview or losing multi-selection', async () => {
    await mount([
        { id: 'image', type: 'gen-image', x: 100, y: 150, width: 320, height: 240, content: '/test-image.png', settings: {} },
        { id: 'video', type: 'gen-video', x: 550, y: 150, width: 320, height: 240, content: '/test-video.mp4', settings: {} },
    ]);
    const preview = () => screen.getByRole('button', { name: '预览图片' });
    expect(screen.queryByRole('button', { name: '更换图片' })).toBeNull();
    expect(screen.queryByLabelText('上传到图片节点')).toBeNull();
    expect(screen.getByRole('button', { name: '更换视频' })).toBeTruthy();
    const move = (target, modifiers = {}) => {
        fireEvent.mouseDown(target, { button: 0, clientX: 200, clientY: 250, ...modifiers });
        act(() => { pointer('pointermove', 240, 280, 40, 30); pointer('pointerup', 240, 280); });
        fireEvent.click(target, { detail: 1, clientX: 240, clientY: 280, ...modifiers });
    };
    move(preview());
    await waitFor(() => expect(node('image').style.left).toBe('140px'));
    expect(document.querySelector('.lightbox-overlay')).toBeNull();
    expect(node('video').style.left).toBe('550px');
    fireEvent.mouseDown(node('video').querySelector('.node-label'), { button: 0, shiftKey: true });
    move(preview());
    await waitFor(() => expect(node('image').style.left).toBe('180px'));
    expect(node('video').style.left).toBe('590px');
    expect(selected()).toEqual(['image', 'video']);
    expect(document.querySelector('.lightbox-overlay')).toBeNull();
    move(node('video').querySelector('video'));
    expect(node('video').style.left).toBe('590px');
    move(node('video').querySelector('.node-label'));
    await waitFor(() => expect(node('video').style.left).toBe('630px'));
    fireEvent.mouseDown(preview(), { button: 0, metaKey: true });
    act(() => pointer('pointerup', 200, 250));
    fireEvent.click(preview(), { detail: 1, metaKey: true });
    expect(selected()).toEqual(['video']);
    expect(document.querySelector('.lightbox-overlay')).toBeNull();
    fireEvent.mouseDown(preview(), { button: 0, clientX: 200, clientY: 250 });
    act(() => pointer('pointerup', 200, 250));
    fireEvent.click(preview(), { detail: 1, clientX: 200, clientY: 250 });
    expect(selected()).toEqual(['image']);
    expect(document.querySelector('.lightbox-overlay')).toBeNull();
    expect(screen.getByLabelText('图片提示词')).toBeTruthy();
    fireEvent.doubleClick(preview(), { detail: 2, metaKey: true });
    expect(document.querySelector('.lightbox-overlay')).toBeNull();
    fireEvent.doubleClick(preview(), { detail: 2 });
    await waitFor(() => expect(document.querySelector('.lightbox-overlay')).toBeTruthy());
}, 40000);

it('accumulates slow pointer movement and the final frame, then undoes a drag in one step', async () => {
    await mount();
    fireEvent.mouseDown(node('a'), { button: 0, clientX: 200, clientY: 250 });
    act(() => {
        for (let step = 1; step <= 20; step++) pointer('pointermove', 200 + step / 2, 250 + step / 2, 0.5, 0.5);
        pointer('pointerup', 214, 264);
    });
    expect([node('a').style.left, node('a').style.top]).toEqual(['114px', '164px']);
    expect(screen.getByRole('button', { name: '撤销 (Ctrl+Z)' }).disabled).toBe(false);
    fireEvent.keyDown(window, { key: 'z', metaKey: true });
    expect([node('a').style.left, node('a').style.top]).toEqual(['100px', '150px']);
    // Browsers report uppercase Z for Shift+Command+Z.
    fireEvent.keyDown(window, { key: 'Z', metaKey: true, shiftKey: true });
    expect([node('a').style.left, node('a').style.top]).toEqual(['114px', '164px']);
}, 30000);

it('keeps preview shortcuts inside the preview and restores selection on Escape', async () => {
    await mount([{ id: 'image', type: 'gen-image', x: 100, y: 150, width: 320, height: 240, content: '/test-image.png', settings: {} }]);
    fireEvent.mouseDown(node('image'), { button: 0, clientX: 200, clientY: 250 });
    act(() => pointer('pointerup', 200, 250));
    fireEvent.click(screen.getByRole('button', { name: '预览图片' }));
    const overlay = document.querySelector('.lightbox-overlay');
    expect(overlay).toBeTruthy();
    fireEvent.keyDown(overlay, { key: 'Delete' });
    expect(node('image')).toBeTruthy();
    fireEvent.keyDown(overlay, { key: 'Escape' });
    expect(document.querySelector('.lightbox-overlay')).toBeNull();
    expect(selected()).toEqual(['image']);
}, 30000);

it('right-clicks the node under the pointer instead of acting on a different selection', async () => {
    const canvas = await mount();
    fireEvent.contextMenu(node('b'), { button: 2, clientX: 650, clientY: 250 });
    expect(selected()).toEqual(['b']);
    fireEvent.keyDown(document, { key: 'Escape' });
    marquee(canvas);
    fireEvent.contextMenu(node('c'), { button: 2, clientX: 1100, clientY: 250 });
    expect(selected()).toEqual(['c']);
}, 30000);

it('undoes keyboard deletion to the latest layout and records a new drag immediately after undo', async () => {
    await mount();
    const drag = end => {
        fireEvent.mouseDown(node('a'), { button: 0, clientX: 200, clientY: 250 });
        act(() => { pointer('pointermove', end, 270); pointer('pointerup', end, 270); });
    };
    drag(220);
    fireEvent.keyDown(window, { key: 'Delete' });
    expect(node('a')).toBeNull();
    fireEvent.keyDown(window, { key: 'z', metaKey: true });
    expect(node('a').style.left).toBe('120px');
    drag(230);
    expect(node('a').style.left).toBe('150px');
    expect(screen.getByRole('button', { name: '重做 (Ctrl+Shift+Z)' }).disabled).toBe(true);
    fireEvent.keyDown(window, { key: 'z', metaKey: true });
    expect(node('a').style.left).toBe('120px');
}, 30000);

it('picks reference images on canvas, renames their labels and removes links with one undo', async () => {
    await mount([
        { id: 'source', title: '蓝杯', type: 'gen-image', x: 100, y: 150, width: 320, height: 240, content: '/blue.png', settings: {} },
        { id: 'target', title: '改色', type: 'gen-image', x: 550, y: 150, width: 320, height: 240, settings: { prompt: '改成橙色' } },
        { id: 'empty', title: '未生成', type: 'gen-image', x: 1000, y: 150, width: 320, height: 240, settings: {} },
    ]);
    fireEvent.mouseDown(node('target'), { button: 0, clientX: 600, clientY: 250 });
    act(() => pointer('pointerup', 600, 250));
    fireEvent.click(screen.getByRole('button', { name: '添加参考', exact: true }));
    expect(screen.getByRole('region', { name: '从画布选择参考' })).toBeTruthy();
    fireEvent.click(node('empty'));
    expect(screen.queryByRole('region', { name: '从画布选择参考' })).toBeNull();
    expect(selected()).toEqual(['empty']);
    expect(screen.getByLabelText('图片提示词')).toBeTruthy();
    fireEvent.mouseDown(node('target'), { button: 0, clientX: 600, clientY: 250 });
    act(() => pointer('pointerup', 600, 250));
    fireEvent.click(screen.getByRole('button', { name: '添加参考', exact: true }));
    fireEvent.click(node('source'));
    expect(screen.queryByRole('region', { name: '从画布选择参考' })).toBeNull();
    expect(screen.getByRole('button', { name: '移除参考：蓝杯' })).toBeTruthy();
    expect(document.querySelector('.lightbox-overlay')).toBeNull();
    fireEvent.doubleClick(screen.getByRole('button', { name: '重命名节点：蓝杯' }));
    fireEvent.change(screen.getByRole('textbox', { name: '节点名称' }), { target: { value: '蓝杯原图' } });
    fireEvent.keyDown(screen.getByRole('textbox', { name: '节点名称' }), { key: 'Enter' });
    expect(screen.getByRole('button', { name: '移除参考：蓝杯原图' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '移除参考：蓝杯原图' }));
    expect(screen.queryByRole('button', { name: '移除参考：蓝杯原图' })).toBeNull();
    fireEvent.keyDown(window, { key: 'z', metaKey: true });
    expect(screen.getByRole('button', { name: '移除参考：蓝杯原图' })).toBeTruthy();
}, 40000);


it('exits reference selection on blank, the target, an existing reference or Escape without trapping canvas input', async () => {
    const canvas = await mount([
        { id: 'source', title: '原图', type: 'gen-image', x: 100, y: 150, width: 320, height: 240, content: '/blue.png', settings: {} },
        { id: 'target', title: '编辑', type: 'gen-image', x: 550, y: 150, width: 320, height: 240, settings: { prompt: '改色' } },
    ]);
    fireEvent.mouseDown(node('target'), { button: 0, clientX: 600, clientY: 250 });
    act(() => pointer('pointerup', 600, 250));
    const open = () => fireEvent.click(screen.getByRole('button', { name: '添加参考', exact: true }));
    const returned = () => {
        expect(screen.queryByRole('region', { name: '从画布选择参考' })).toBeNull();
        expect(selected()).toEqual(['target']);
        expect(screen.getByLabelText('图片提示词')).toBeTruthy();
    };
    open();
    fireEvent.click(screen.getByRole('button', { name: '重置视图' }));
    expect(screen.getByRole('region', { name: '从画布选择参考' })).toBeTruthy();
    fireEvent.mouseDown(canvas, { button: 0, clientX: 1400, clientY: 650 });
    fireEvent.click(canvas, { button: 0, clientX: 1400, clientY: 650 });
    returned();
    expect(document.querySelector('.canvas-selection-box')).toBeNull();
    open(); fireEvent.click(node('target')); returned();
    open(); fireEvent.click(node('source')); returned();
    expect(screen.getAllByRole('button', { name: '移除参考：原图' })).toHaveLength(1);
    open(); fireEvent.click(node('source')); returned();
    expect(screen.getAllByRole('button', { name: '移除参考：原图' })).toHaveLength(1);
    open(); fireEvent.keyDown(window, { key: 'Escape' }); returned();
    open(); fireEvent.click(screen.getByRole('button', { name: '退出', exact: true })); returned();
}, 40000);
