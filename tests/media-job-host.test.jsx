import React from 'react';
import { act, render, waitFor, fireEvent, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
vi.mock('@/services/platformContext', () => ({ platformEnabled: true, getPlatformContext: () => ({ user: { id: 'user', role: 'admin' }, project: { id: 'project', name: '异步测试' }, models: [] }), editorModels: () => [], platformModel: () => null }));
vi.mock('@/services/workspaceLibrary', () => ({ libraryScope: () => 'user', listLibraryEntries: async () => [], saveLibraryEntry: vi.fn(), removeLibraryEntry: vi.fn() }));
vi.mock('@/services/apiClient', () => ({ api: async () => ({ items: [] }), nativeFetch: async () => new Response('{}', { status: 503 }), setCsrf: vi.fn() }));
vi.mock('@/services/mediaJobs', () => ({ watchMediaJob: vi.fn(async () => ({})) }));

it('restores a background render into the unselected node once and ignores another project', async () => {
    window.localStorage.clear();
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
    const prefix = 'elren:v2:user:project:';
    window.localStorage.setItem(prefix + 'elren_nodes', JSON.stringify([{ id: 'timeline', type: 'video-timeline', x: 100, y: 100, width: 400, height: 250, settings: { clips: [], mediaJobId: 'render' } }]));
    window.localStorage.setItem(prefix + 'elren_connections', '[]');
    const { default: Editor } = await import('@/App.jsx');
    const view = render(<Editor />);
    const snapshot = () => JSON.parse(window.localStorage.getItem(prefix + 'elren_autosave_journal'));
    try {
        const result = { id: 'render', project_id: 'project', status: 'succeeded', result: { asset: { url: '/result.mp4', mime: 'video/mp4' } } };
        act(() => window.dispatchEvent(new CustomEvent('platform:media-job', { detail: result })));
        await waitFor(() => expect(snapshot().nodes).toHaveLength(2));
        expect(snapshot().nodes.find(node => node.id === 'timeline')).toMatchObject({ content: '/result.mp4', settings: { renderedJobId: 'render' } });
        expect(snapshot().nodes.find(node => node.type === 'preview').previewType).toBe('video');
        act(() => window.dispatchEvent(new CustomEvent('platform:media-job', { detail: result })));
        act(() => window.dispatchEvent(new CustomEvent('platform:media-job', { detail: { ...result, project_id: 'other' } })));
        expect(snapshot().nodes).toHaveLength(2);
    } finally { view.unmount(); }
}, 30000);

it('keeps comparison dragging inside its widget and opens the correct input picker by keyboard', async () => {
    window.localStorage.clear();
    const prefix = 'elren:v2:user:project:';
    window.localStorage.setItem(prefix + 'elren_nodes', JSON.stringify([
        { id: 'a', type: 'input-image', x: 0, y: 0, width: 100, height: 100, content: '/a.png' },
        { id: 'b', type: 'input-image', x: 150, y: 0, width: 100, height: 100, content: '/b.png' },
        { id: 'compare', type: 'image-compare', x: 100, y: 150, width: 400, height: 300 },
    ]));
    window.localStorage.setItem(prefix + 'elren_connections', JSON.stringify([{ id: 'a-link', from: 'a', to: 'compare', inputType: 'imageA' }, { id: 'b-link', from: 'b', to: 'compare', inputType: 'imageB' }]));
    const { default: Editor } = await import('@/App.jsx');
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, left: 0, top: 0, width: 1470, height: 780, right: 1470, bottom: 780 });
    const view = render(<Editor />);
    try {
        const compare = view.container.querySelector('.node-wrapper[data-node-id="compare"]');
        const left = compare.style.left;
        const divider = screen.getByRole('slider', { name: '图像对比分界' });
        fireEvent.mouseDown(divider, { button: 0, clientX: 200, clientY: 200 });
        act(() => { window.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 300, clientY: 200 })); window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true })); });
        expect(compare.style.left).toBe(left);
        fireEvent.keyDown(screen.getByRole('button', { name: '连接对比图片 B' }), { key: 'Enter' });
        expect(screen.getByRole('heading', { name: '选择对比图片 B' })).toBeTruthy();
    } finally { view.unmount(); rect.mockRestore(); }
}, 30000);

it('creates and initializes an image process node without a save-status render loop', async () => {
    window.localStorage.clear();
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
    const prefix = 'elren:v2:user:project:';
    window.localStorage.setItem(prefix + 'elren_nodes', JSON.stringify([{ id: 'photo', type: 'input-image', x: 100, y: 100, width: 400, height: 280, content: '/test-photo.png', dimensions: { w: 1280, h: 720 }, settings: {} }]));
    window.localStorage.setItem(prefix + 'elren_connections', '[]');
    const { default: Editor } = await import('@/App.jsx');
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, left: 0, top: 0, width: 1470, height: 780, right: 1470, bottom: 780 });
    const view = render(<Editor />);
    try {
        fireEvent.mouseDown(view.container.querySelector('.node-wrapper[data-node-id="photo"]'), { button: 0 });
        act(() => window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true })));
        fireEvent.click(await screen.findByRole('button', { name: '切分', exact: true }));
        expect(await screen.findByRole('button', { name: '快速切分', exact: true })).toBeTruthy();
        await waitFor(() => {
            const saved = JSON.parse(window.localStorage.getItem(prefix + 'elren_autosave_journal'));
            expect(saved.nodes).toHaveLength(2);
            expect(saved.nodes.find(node => node.type === 'image-process').settings).toMatchObject({ imageOperation: 'split', width: 1280, height: 720 });
        });
    } finally { view.unmount(); rect.mockRestore(); }
}, 30000);
