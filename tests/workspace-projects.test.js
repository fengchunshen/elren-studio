import { beforeEach, expect, it, vi } from 'vitest';
const session = vi.hoisted(() => ({ user: { id: 'owner-a' }, project: { id: 'p1' } }));
vi.mock('@/services/platformContext', () => ({ platformEnabled: true, getPlatformContext: () => session }));
vi.mock('@/services/apiClient', () => ({ api: vi.fn() }));
vi.mock('@/services/workspaceLibrary', () => ({
    libraryScope: () => session.user.id, listLibraryEntries: async () => [], saveLibraryEntry: vi.fn(async value => value),
}));
import { api } from '@/services/apiClient';
import { createWorkspaceProject, writeWorkspaceSnapshot, workspaceProjectPrefix } from '@/services/workspaceProjects';

const databases = new Map();
beforeEach(() => {
    session.user.id = 'owner-a'; window.localStorage.clear(); databases.clear(); api.mockReset();
    // Minimal async storage adapter: exercise service ordering, identity and metadata contracts.
    // Actual IndexedDB persistence is also checked in the existing Chrome workspace.
    Object.defineProperty(window, 'indexedDB', { configurable: true, value: { open(name) {
        if (!databases.has(name)) databases.set(name, new Map());
        const values = databases.get(name);
        const result = { close() {}, transaction() {
            const tx = { objectStore: () => ({
                put(value, key) { values.set(key, value); queueMicrotask(() => tx.oncomplete?.()); },
                get(key) { const request = {}; queueMicrotask(() => { request.result = values.get(key); request.onsuccess?.(); }); return request; },
            }) };
            return tx;
        } };
        const request = { result }; queueMicrotask(() => request.onsuccess?.()); return request;
    } } });
    api.mockImplementation(async (path, options) => path === '/projects' && options?.method === 'POST'
        ? { id: 'p2', name: options.body.name } : { items: [{ id: 'p1', name: '原项目' }] });
});

it('copies owned project nodes, named groups and comments into an isolated project without copying credentials', async () => {
    await writeWorkspaceSnapshot('p1', { projectName: '原项目', nodes: [{ id: 'n', type: 'text-node', x: 0, y: 0, workflowGroup: { id: 'g', name: '分组一' }, settings: { apiKey: 'must-not-copy' } }], connections: [], annotations: [{ id: 'note', text: '批注', x: 10, y: 20 }] });
    const result = await createWorkspaceProject('项目副本', 'p1');
    expect(result.id).toBe('p2');
    const snapshot = JSON.parse(databases.get(`${workspaceProjectPrefix('p2')}elren_autosave_db`).get('latest'));
    expect(snapshot.projectName).toBe('项目副本');
    expect(snapshot.nodes[0].workflowGroup).toEqual({ id: 'g', name: '分组一' });
    expect(snapshot.nodes[0].settings.apiKey).toBeUndefined();
    expect(snapshot.annotations[0].text).toBe('批注');
    expect(JSON.parse(databases.get(`${workspaceProjectPrefix('p1')}elren_autosave_db`).get('latest')).projectName).toBe('原项目');
});

it('uses the latest local fallback snapshot instead of an older IndexedDB copy', async () => {
    await writeWorkspaceSnapshot('p1', { nodes: [{ id: 'old' }], connections: [] });
    const prefix = workspaceProjectPrefix('p1');
    window.localStorage.setItem(`${prefix}elren_autosave_meta`, JSON.stringify({ storage: 'local' }));
    window.localStorage.setItem(`${prefix}elren_autosave`, JSON.stringify({ nodes: [{ id: 'latest' }], connections: [] }));
    await createWorkspaceProject('副本', 'p1');
    expect(JSON.parse(databases.get(`${workspaceProjectPrefix('p2')}elren_autosave_db`).get('latest')).nodes[0].id).toBe('latest');
});

it('rejects inaccessible source projects and account changes before writing a destination snapshot', async () => {
    await expect(createWorkspaceProject('副本', 'foreign-project')).rejects.toThrow('无法访问');
    expect(api.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false);
    api.mockImplementation(async () => { session.user.id = 'owner-b'; return { id: 'p2' }; });
    await expect(createWorkspaceProject('新项目')).rejects.toThrow('账号已切换');
    expect(databases.size).toBe(0);
});
