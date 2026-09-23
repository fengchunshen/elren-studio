import React from 'react';
import { expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { saveLibraryEntry } from '@/services/workspaceLibrary';
vi.mock('@/services/workspaceLibrary', () => ({
    libraryScope: () => 'local', listLibraryEntries: async () => [],
    saveLibraryEntry: vi.fn(async entry => ({ ...entry, id: entry.id || 'saved-test-workflow' })), removeLibraryEntry: vi.fn(),
}));

// Exercise the real editor, with no network requests or persisted user projects.
vi.mock('@/services/apiClient', () => ({
    nativeFetch: vi.fn(async () => new Response('{}', { status: 503 })),
    api: vi.fn(async () => ({ items: [] })),
    setCsrf: vi.fn(),
}));
vi.mock('@/services/platformContext', () => ({
    platformEnabled: false,
    getPlatformContext: () => null,
    editorModels: () => [],
    platformModel: () => null,
}));

Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({
        matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
    }) });

// Model node/inspector rectangles separately: treating every element as a full
// viewport makes the inspector auto-pan real nodes out of the test viewport.
function canvasGeometry(canvas) {
    return function () {
        if (this.hasAttribute('data-node-inspector')) return { ...canvas, width: 560, height: 180, bottom: canvas.top + 180 };
        if (!this.classList.contains('node-wrapper')) return canvas;
        const transform = this.parentElement.style.transform;
        const [, tx = 0, ty = 0] = transform.match(/translate3d\(([-\d.]+)px, ([-\d.]+)px/) || [];
        const zoom = Number(transform.match(/scale\(([-\d.]+)\)/)?.[1] || 1);
        const left = canvas.left + Number(tx) + parseFloat(this.style.left) * zoom;
        const top = canvas.top + Number(ty) + parseFloat(this.style.top) * zoom;
        const width = parseFloat(this.style.width) * zoom, height = parseFloat(this.style.height) * zoom;
        return { x: left, y: top, left, top, width, height, right: left + width, bottom: top + height };
    };
}

it('mounts the real editor and opens/closes its shadcn configuration dialog', async () => {
    window.localStorage.clear();
    const { default: Editor } = await import('@/App.jsx');
    const view = render(<Editor />);
    const projectMenu = await screen.findByRole('button', { name: /项目菜单/ });
    fireEvent.pointerDown(projectMenu, { button: 0, ctrlKey: false });
    const settings = await screen.findByRole('menuitem', { name: 'API 设置' });
    expect(document.querySelector('#canvas-bg')).toBeTruthy();
    fireEvent.click(settings);
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(screen.getByRole('heading', { name: '模型接口配置' })).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    view.unmount();
}, 30000);

it('moves and copies a whole named group, undoes the copy, and saves directly to My Templates', async () => {
    window.localStorage.clear();
    const group = { id: 'group-test', name: '三镜头流程' };
    window.localStorage.setItem('elren_nodes', JSON.stringify([
        { id: 'group-a', type: 'text-node', x: 100, y: 150, width: 320, height: 240, settings: { text: '脚本' }, workflowGroup: group },
        { id: 'group-b', type: 'text-node', x: 550, y: 150, width: 320, height: 240, settings: { text: '镜头' }, workflowGroup: group },
        { id: 'outside', type: 'text-node', x: 950, y: 150, width: 320, height: 240, settings: { text: '保留' } },
    ]));
    window.localStorage.setItem('elren_connections', JSON.stringify([{ id: 'test-link', from: 'group-a', to: 'group-b' }]));
    const { default: Editor } = await import('@/App.jsx');
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(canvasGeometry({ x: 0, y: 0, left: 0, top: 0, width: 3000, height: 1200, right: 3000, bottom: 1200 }));
    const editor = render(<Editor />);
    try {
    const position = id => document.querySelector(`[data-node-id="${id}"]`).style.left;
    fireEvent.mouseDown(screen.getByRole('button', { name: '移动分组：三镜头流程' }), { button: 0, clientX: 200, clientY: 100 });
    const move = new MouseEvent('pointermove', { bubbles: true, clientX: 240, clientY: 130 });
    Object.defineProperties(move, { movementX: { value: 40 }, movementY: { value: 30 } });
    act(() => { window.dispatchEvent(move); window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: move.clientX, clientY: move.clientY })); });
    await waitFor(() => expect(position('group-a')).toBe('140px'));
    expect(position('group-b')).toBe('590px');
    expect(position('outside')).toBe('950px');
    fireEvent.pointerDown(screen.getByRole('button', { name: '管理分组：三镜头流程' }), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole('menuitem', { name: '复制整组' }));
    expect(document.querySelectorAll('[data-workflow-group]')).toHaveLength(2);
    expect(document.querySelectorAll('.node-wrapper')).toHaveLength(5);
    fireEvent.click(screen.getByRole('button', { name: '撤销 (Ctrl+Z)' }));
    expect(document.querySelectorAll('[data-workflow-group]')).toHaveLength(1);
    expect(document.querySelectorAll('.node-wrapper')).toHaveLength(3);
    fireEvent.pointerDown(screen.getByRole('button', { name: '管理分组：三镜头流程' }), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole('menuitem', { name: '保存到我的模板' }));
    expect(await screen.findByDisplayValue('三镜头流程')).toBeTruthy();
    expect(screen.getByRole('button', { name: '我的模板' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: '保存', exact: true }));
    await waitFor(() => expect(screen.queryByRole('form', { name: '保存模板' })).toBeNull());
    expect(screen.getByRole('button', { name: '查看模板：三镜头流程' })).toBeTruthy();
    const saved = saveLibraryEntry.mock.calls.at(-1)[0];
    expect(saved.nodes.map(node => node.id)).toEqual(['group-a', 'group-b']);
    expect(saved.connections).toHaveLength(1);
    expect(saved.nodes.every(node => node.workflowGroup.name === '三镜头流程')).toBe(true);
    } finally { editor.unmount(); rectSpy.mockRestore(); }
}, 30000);

it('places comments inline without a sidebar or modal and exits comment mode with Escape', async () => {
    window.localStorage.clear();
    window.localStorage.setItem('elren_nodes', JSON.stringify([
        { id: 'comment-target', type: 'text-node', x: 100, y: 100, width: 320, height: 240, settings: { text: 'Do not move this node' } },
    ]));
    const { default: Editor } = await import('@/App.jsx');
    const editor = render(<Editor />);
    const canvas = document.querySelector('#canvas-bg');
    const rect = vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 56, top: 48, width: 1200, height: 800, x: 56, y: 48, right: 1256, bottom: 848 });
    try {
        fireEvent.click(screen.getByRole('button', { name: '打开评论模式' }));
        expect(canvas.getAttribute('data-comment-mode')).toBe('true');
        expect(document.querySelector('[data-slot="popover-content"]')).toBeNull();
        const node = document.querySelector('.node-wrapper[data-node-id="comment-target"]');
        fireEvent.mouseDown(node, { button: 0, clientX: 320, clientY: 240 });
        fireEvent.click(node, { button: 0, clientX: 320, clientY: 240 });
        const input = document.querySelector('[data-canvas-comment-editor] textarea');
        expect(input).toBeTruthy();
        expect(document.querySelector('[data-slot="dialog-overlay"]')).toBeNull();
        expect(node.style.left).toBe('100px');
        expect(node.getAttribute('data-selected')).toBe('false');
        fireEvent.change(input, { target: { value: '调整这里的构图' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(document.querySelector('[data-canvas-comment-editor]')).toBeNull();
        const pin = document.querySelector('[data-canvas-annotation]');
        expect(pin).toBeTruthy();
        const saved = JSON.parse(window.localStorage.getItem('elren_canvas_annotations'));
        expect(saved).toHaveLength(1);
        expect(saved[0]).toMatchObject({ text: '调整这里的构图', x: 264, y: 192 });
        expect(canvas.getAttribute('data-comment-mode')).toBe('true');
        fireEvent.click(pin);
        expect(document.querySelector('[data-canvas-comment-editor] textarea').value).toBe('调整这里的构图');
        fireEvent.keyDown(document.querySelector('[data-canvas-comment-editor] textarea'), { key: 'Escape' });
        expect(canvas.getAttribute('data-comment-mode')).toBe('false');
        expect(document.querySelector('[data-canvas-comment-editor]')).toBeNull();
        expect(document.querySelector('[data-canvas-annotation]')).toBeTruthy();
    } finally { rect.mockRestore(); editor.unmount(); }
}, 30000);

it('wires canvas controls to real connections, dragging, viewport and saved preferences', async () => {
    window.localStorage.clear();
    window.localStorage.setItem('elren_nodes', JSON.stringify([
        { id: 'canvas-a', type: 'text-node', x: 43, y: 57, width: 320, height: 250, settings: { text: 'A' } },
        { id: 'canvas-b', type: 'text-node', x: 640, y: 400, width: 320, height: 250, settings: { text: 'B' } },
    ]));
    window.localStorage.setItem('elren_connections', JSON.stringify([{ id: 'canvas-link', from: 'canvas-a', to: 'canvas-b' }]));
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(canvasGeometry({
        x: 56, y: 48, left: 56, top: 48, right: 1256, bottom: 848, width: 1200, height: 800,
    }));
    let editor;
    try {
        const { default: Editor } = await import('@/App.jsx');
        editor = render(<Editor />);
        const canvas = document.querySelector('#canvas-bg');
        const world = canvas.firstElementChild;
        const position = () => {
            const node = document.querySelector('[data-node-id="canvas-a"]');
            return [node.style.left, node.style.top];
        };
        expect(document.querySelectorAll('.connection-group')).toHaveLength(1);
        fireEvent.click(screen.getByRole('button', { name: '隐藏节点连线' }));
        expect(document.querySelectorAll('.connection-group')).toHaveLength(0);
        fireEvent.click(screen.getByRole('button', { name: '显示节点连线' }));
        expect(document.querySelectorAll('.connection-group')).toHaveLength(1);
        fireEvent.click(screen.getByRole('button', { name: '关闭小地图' }));
        expect(screen.queryByRole('img', { name: '画布小地图' })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: '打开小地图' }));
        expect(document.querySelectorAll('[data-minimap-node]')).toHaveLength(2);

        // Ordinary wheel pans in both directions without changing zoom.
        expect(fireEvent.wheel(canvas, { deltaY: 120, clientX: 656, clientY: 448 })).toBe(false);
        expect(world.style.transform).toContain('translate3d(0px, -120px, 0)');
        expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('100');
        fireEvent.wheel(canvas, { deltaY: -120 });
        expect(world.style.transform).toContain('translate3d(0px, 0px, 0)');
        // Control reaches the canvas listener, cancels browser zoom, and anchors canvas zoom at the cursor.
        expect(fireEvent.wheel(canvas, { deltaY: -100, ctrlKey: true, clientX: 656, clientY: 448 })).toBe(false);
        expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('110');
        const [, zoomX, zoomY] = world.style.transform.match(/translate3d\(([^p]+)px, ([^p]+)px/);
        expect(Number(zoomX)).toBeCloseTo(-60);
        expect(Number(zoomY)).toBeCloseTo(-40);
        fireEvent.wheel(canvas, { deltaY: 100, ctrlKey: true, clientX: 656, clientY: 448 });
        expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('100');
        const text = document.querySelector('[data-node-id="canvas-a"] [contenteditable="true"]');
        const textScroll = text.closest('.rich-text-content');
        Object.defineProperties(textScroll, { scrollHeight: { configurable: true, value: 600 }, clientHeight: { configurable: true, value: 100 } });
        const beforeTextScroll = world.style.transform;
        fireEvent.wheel(text, { deltaY: 50 });
        expect(textScroll.scrollTop).toBe(50);
        expect(world.style.transform).toBe(beforeTextScroll);
        fireEvent.wheel(text, { deltaY: -100, ctrlKey: true, clientX: 656, clientY: 448 });
        expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('110');
        expect(textScroll.scrollTop).toBe(50);
        fireEvent.wheel(text, { deltaY: 100, ctrlKey: true, clientX: 656, clientY: 448 });
        // Controls do not move the canvas or let Control + wheel zoom the browser.
        const beforeControlScroll = world.style.transform;
        expect(fireEvent.wheel(screen.getByRole('slider'), { deltaY: 100, ctrlKey: true })).toBe(false);
        expect(world.style.transform).toBe(beforeControlScroll);

        const originalPosition = position();
        fireEvent.keyDown(window, { key: '-', ctrlKey: true });
        expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('90');
        fireEvent.keyDown(window, { key: '=', ctrlKey: true });
        expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('100');
        expect(position()).toEqual(originalPosition);
        const transform = world.style.transform;
        fireEvent.keyDown(text, { key: '0', ctrlKey: true });
        expect(world.style.transform).toBe(transform);

        fireEvent.click(screen.getByRole('button', { name: '开启网格吸附' }));
        const node = document.querySelector('[data-node-id="canvas-a"]');
        fireEvent.mouseDown(node, { button: 0, clientX: 110, clientY: 115 });
        const move = new MouseEvent('pointermove', { bubbles: true, clientX: 127, clientY: 128 });
        Object.defineProperties(move, { movementX: { value: 17 }, movementY: { value: 13 } });
        // Release within the same frame: snapping must include the last queued movement.
        act(() => { window.dispatchEvent(move); window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: move.clientX, clientY: move.clientY })); });
        await waitFor(() => expect(position()).toEqual(['60px', '80px']));
        fireEvent.click(screen.getByRole('button', { name: '关闭网格吸附' }));
        fireEvent.mouseDown(document.querySelector('[data-node-id="canvas-a"]'), { button: 0, clientX: 110, clientY: 115 });
        act(() => { window.dispatchEvent(move); window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: move.clientX, clientY: move.clientY })); });
        await waitFor(() => expect(position()).toEqual(['77px', '93px']));
        const beforeReset = position();
        fireEvent.keyDown(window, { key: '0', metaKey: true });
        expect(world.style.transform).not.toBe(transform);
        expect(position()).toEqual(beforeReset);
        expect(JSON.parse(window.localStorage.getItem('elren_canvas_preferences'))).toEqual({ minimap: true, connections: true, snap: false });
    } finally {
        editor?.unmount();
        rectSpy.mockRestore();
    }
}, 30000);

it('keeps the inspector selected during portal interactions and canvas panning, but dismisses on a background click', async () => {
    window.localStorage.clear();
    window.localStorage.setItem('elren_api_configs', JSON.stringify([
        { id: 'ux-video-model', _uid: 'ux-video-model', type: 'Video', displayName: '交互测试模型', resolutions: ['720P'], durations: ['5s', '8s'] },
    ]));
    window.localStorage.setItem('elren_nodes', JSON.stringify([
        { id: 'ux-video', type: 'gen-video', x: 100, y: 150, width: 440, height: 250, settings: { model: 'ux-video-model', videoPrompt: '保留提示词' } },
    ]));
    const { default: Editor } = await import('@/App.jsx');
    const editor = render(<Editor />);
    try {
        const canvas = document.querySelector('#canvas-bg');
        const node = document.querySelector('[data-node-id="ux-video"]');
        fireEvent.mouseDown(node, { button: 0, clientX: 200, clientY: 200 });
        act(() => window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 200, clientY: 200 })));
        const trigger = await screen.findByRole('button', { name: '生成规格' });
        // Command-clicking a portal control must not toggle its owning canvas node out of selection.
        fireEvent.mouseDown(trigger, { button: 0, metaKey: true });
        expect(screen.getByRole('region', { name: '视频生成设置' })).toBeTruthy();
        fireEvent.click(trigger);
        fireEvent.click(await screen.findByRole('button', { name: '时长 8s' }));
        expect(trigger.textContent).toContain('8s');
        const before = canvas.firstElementChild.style.transform;
        fireEvent.mouseDown(canvas, { button: 1, clientX: 900, clientY: 100 });
        expect(screen.queryByRole('region', { name: '视频生成设置' })).toBeNull();
        expect(document.querySelector('[data-node-inspector]').getAttribute('data-suspended')).toBe('true');
        expect(document.querySelector('[data-slot="popover-content"][data-state="open"]')).toBeNull();
        act(() => {
            window.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 950, clientY: 130 }));
            window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
        });
        await waitFor(() => expect(canvas.firstElementChild.style.transform).not.toBe(before));
        expect(screen.getByRole('region', { name: '视频生成设置' })).toBeTruthy();
        expect(node.style.left).toBe('100px');
        expect(screen.getByRole('textbox', { name: '视频提示词' }).textContent).toBe('保留提示词');
        expect(screen.getByRole('button', { name: '生成规格' }).getAttribute('data-state')).toBe('closed');
        fireEvent.mouseDown(canvas, { button: 0, clientX: 900, clientY: 100 });
        act(() => window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 900, clientY: 100 })));
        await waitFor(() => expect(screen.queryByRole('region', { name: '视频生成设置' })).toBeNull());
    } finally { editor.unmount(); }
}, 40000);

it('drags text nodes from card whitespace and the title while keeping text editing stationary', async () => {
    window.localStorage.clear();
    window.localStorage.setItem('elren_nodes', JSON.stringify([
        { id: 'drag-text', type: 'text-node', x: 100, y: 150, width: 320, height: 240, settings: { text: '可编辑的脚本正文' } },
    ]));
    const { default: Editor } = await import('@/App.jsx');
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
        const top = this.classList.contains('node-wrapper') ? parseFloat(this.style.top) : 0;
        const height = this.classList.contains('node-wrapper') ? parseFloat(this.style.height) : this.hasAttribute('data-node-inspector') ? 178 : 800;
        return { x: 0, y: top, left: 0, top, width: 1200, height, right: 1200, bottom: top + height };
    });
    const view = render(<Editor />);
    const hitTest = document.elementFromPoint;
    document.elementFromPoint = () => null; // jsdom has no caret hit testing; pointer routing is under test.
    try {
        const node = () => document.querySelector('[data-node-id="drag-text"].node-wrapper');
        const position = () => [node().style.left, node().style.top];
        const move = (target, dx, dy) => {
            fireEvent.mouseDown(target, { button: 0, clientX: 200, clientY: 220 });
            const event = new MouseEvent('pointermove', { bubbles: true, clientX: 200 + dx, clientY: 220 + dy });
            Object.defineProperties(event, { movementX: { value: dx }, movementY: { value: dy } });
            act(() => { window.dispatchEvent(event); window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: event.clientX, clientY: event.clientY })); });
        };
        move(node().querySelector('[data-text-node-body]'), 40, 30);
        await waitFor(() => expect(position()).toEqual(['140px', '180px']));
        move(node().querySelector('.node-label'), 20, 20);
        await waitFor(() => expect(position()).toEqual(['160px', '200px']));
        move(node().querySelector('[contenteditable="true"]'), 50, 40);
        expect(position()).toEqual(['160px', '200px']);
        expect(node().querySelector('[contenteditable="true"]').textContent).toBe('可编辑的脚本正文');
    } finally {
        view.unmount();
        rectSpy.mockRestore();
        if (hitTest) document.elementFromPoint = hitTest; else delete document.elementFromPoint;
    }
}, 40000);

it('creates one downstream image from a node plus, connects the source and undoes it together', async () => {
    window.localStorage.clear();
    window.localStorage.setItem('elren_nodes', JSON.stringify([
        { id: 'reference-source', type: 'text-node', x: 100, y: 150, width: 280, height: 200, settings: { text: '保留瓶身结构，清晨柔光' } },
    ]));
    const { default: Editor } = await import('@/App.jsx');
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(canvasGeometry({ x: 0, y: 0, left: 0, top: 0, width: 1600, height: 900, right: 1600, bottom: 900 }));
    const view = render(<Editor />);
    try {
        const source = document.querySelector('[data-node-id="reference-source"].node-wrapper');
        fireEvent.mouseDown(source, { button: 0, clientX: 200, clientY: 200 });
        act(() => window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 200, clientY: 200 })));
        expect(source.querySelectorAll('[data-node-add-control]')).toHaveLength(2);
        fireEvent.pointerDown(screen.getByRole('button', { name: '引用该节点生成' }), { button: 0, ctrlKey: false });
        fireEvent.click(await screen.findByRole('menuitem', { name: '图片生成', exact: true }));
        const target = document.querySelector('.node-wrapper[data-node-kind="gen-image"]');
        expect(target).toBeTruthy();
        expect(target.getAttribute('data-selected')).toBe('true');
        expect(document.querySelectorAll('.node-wrapper')).toHaveLength(2);
        expect(document.querySelectorAll('.connection-group')).toHaveLength(1);
        expect(screen.getByRole('button', { name: '文本', exact: true })).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: '查看参考文本' }));
        expect(await screen.findByRole('dialog', { name: '参考文本' })).toHaveProperty('textContent', '保留瓶身结构，清晨柔光');
        fireEvent.click(screen.getByRole('button', { name: '撤销 (Ctrl+Z)' }));
        await waitFor(() => expect(document.querySelectorAll('.node-wrapper')).toHaveLength(1));
        expect(document.querySelectorAll('.connection-group')).toHaveLength(0);
        expect(document.querySelector('[data-node-id="reference-source"] [contenteditable]').textContent).toBe('保留瓶身结构，清晨柔光');
    } finally { view.unmount(); rectSpy.mockRestore(); }
}, 40000);

it('keeps zoom when a plus-created node must avoid neighbors and distant canvas content', async () => {
    window.localStorage.clear();
    window.localStorage.setItem('elren_workspace_view', JSON.stringify({ x: 0, y: 0, zoom: 1.2 }));
    window.localStorage.setItem('elren_nodes', JSON.stringify([
        { id: 'near-source', type: 'text-node', x: 100, y: 150, width: 280, height: 200, settings: { text: '参考文本' } },
        { id: 'occupied', type: 'preview', x: 540, y: 100, width: 400, height: 300, settings: {} },
        { id: 'far-away', type: 'preview', x: 9000, y: -4000, width: 440, height: 250, settings: {} },
    ]));
    const { default: Editor } = await import('@/App.jsx');
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(canvasGeometry({ x: 0, y: 0, left: 0, top: 0, width: 1200, height: 800, right: 1200, bottom: 800 }));
    const view = render(<Editor />);
    try {
        const source = document.querySelector('[data-node-id="near-source"].node-wrapper');
        fireEvent.mouseDown(source, { button: 0, clientX: 200, clientY: 200 });
        act(() => window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 200, clientY: 200 })));
        const zoom = screen.getByRole('slider', { name: '放大/缩小画布' }).getAttribute('aria-valuenow');
        fireEvent.pointerDown(source.querySelector('[aria-label="引用该节点生成"]'), { button: 0, ctrlKey: false });
        fireEvent.click(await screen.findByRole('menuitem', { name: '图片生成', exact: true }));
        const target = document.querySelector('.node-wrapper[data-node-kind="gen-image"]');
        expect(target).toBeTruthy();
        expect(target.style.left).toBe('540px');
        expect(target.style.top).toBe('480px');
        expect(screen.getByRole('slider', { name: '放大/缩小画布' }).getAttribute('aria-valuenow')).toBe(zoom);
        expect(target.getAttribute('data-selected')).toBe('true');
    } finally { view.unmount(); rectSpy.mockRestore(); }
}, 40000);
