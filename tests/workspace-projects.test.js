import { beforeEach, expect, it, vi } from 'vitest';
const session = vi.hoisted(() => ({ platform: true, user: { id: 'owner-a' }, project: { id: 'p1' } }));
vi.mock('@/services/platformContext', () => ({ get platformEnabled() { return session.platform; }, getPlatformContext: () => session }));
vi.mock('@/services/apiClient', () => ({ api: vi.fn() }));
vi.mock('@/services/workspaceLibrary', () => ({
    libraryScope: () => session.platform ? session.user.id : 'local', listLibraryEntries: async () => [], saveLibraryEntry: vi.fn(async value => value), removeLibraryEntry: vi.fn(async () => {}),
}));
import { api } from '@/services/apiClient';
import { removeLibraryEntry } from '@/services/workspaceLibrary';
import { createWorkspaceProject, deleteWorkspaceProject, deleteWorkspaceProjects, listWorkspaceProjects, writeWorkspaceSnapshot, workspaceProjectPrefix } from '@/services/workspaceProjects';

const databases = new Map();
const storedKeys = () => Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index));
beforeEach(() => {
    session.platform = true; session.user.id = 'owner-a'; window.history.replaceState({}, '', '/'); window.localStorage.clear(); databases.clear(); api.mockReset(); removeLibraryEntry.mockClear();
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
    }, deleteDatabase(name) {
        const request = {}; queueMicrotask(() => { databases.delete(name); request.onsuccess?.(); }); return request;
    }, databases: async () => [...databases.keys()].map(name => ({ name })) } });
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

it('archives a deleted platform project and clears only its own browser data', async () => {
    await writeWorkspaceSnapshot('p1', { projectName: '当前项目', nodes: [], connections: [] });
    await writeWorkspaceSnapshot('p2', { projectName: '旧项目', nodes: [], connections: [] });
    const prefix = workspaceProjectPrefix('p2');
    window.localStorage.setItem(`${prefix}elren_history`, '[]');
    window.localStorage.setItem('elren:project:owner-a', 'p1');
    databases.set(`${prefix}elren_images_db`, new Map());
    await deleteWorkspaceProject({ id: 'p2', name: '旧项目' });
    expect(api).toHaveBeenCalledWith('/projects/p2', { method: 'PATCH', body: { name: '旧项目', archived: true } });
    expect(removeLibraryEntry).toHaveBeenCalledWith('project:p2', 'owner-a');
    expect(storedKeys().filter(key => key.startsWith(prefix))).toEqual([]);
    expect([...databases.keys()]).toEqual([`${workspaceProjectPrefix('p1')}elren_autosave_db`]);
    expect(window.localStorage.getItem(`${workspaceProjectPrefix('p1')}elren_project_name`)).toBe('当前项目');
    expect(window.localStorage.getItem('elren:project:owner-a')).toBe('p1');
});

it('refuses to delete the open project before touching the server or storage', async () => {
    window.history.replaceState({}, '', '/canvas/p1');
    await writeWorkspaceSnapshot('p1', { projectName: '当前项目', nodes: [], connections: [] });
    await expect(deleteWorkspaceProject({ id: 'p1', name: '当前项目' })).rejects.toThrow('当前打开的项目不能删除');
    expect(api).not.toHaveBeenCalled();
    expect(removeLibraryEntry).not.toHaveBeenCalled();
    expect(databases.size).toBe(1);
});

it('batch delete reports failures and stops touching the server after an account switch', async () => {
    window.history.replaceState({}, '', '/canvas/p1');
    api.mockImplementation(async path => { if (path === '/projects/p3') session.user.id = 'owner-b'; return {}; });
    const { deleted, failed } = await deleteWorkspaceProjects([{ id: 'p1', name: '当前项目' }, { id: 'p2', name: '旧项目' }, { id: 'p3', name: '切换时' }, { id: 'p4', name: '之后' }]);
    expect(deleted.map(project => project.id)).toEqual(['p2']);
    expect(failed.map(({ project, error }) => [project.id, error.message])).toEqual([['p1', '当前打开的项目不能删除'], ['p3', '账号已切换，请重新打开工作空间'], ['p4', '账号已切换，请重新打开工作空间']]);
    expect(api.mock.calls.map(([path]) => path)).toEqual(['/projects/p2', '/projects/p3']);
});

it('keeps browser-wide settings when deleting the default local project', async () => {
    session.platform = false;
    await writeWorkspaceSnapshot('local-default', { projectName: '默认项目', nodes: [{ id: 'n' }], connections: [] });
    window.localStorage.setItem('elren_nodes', '[]');
    window.localStorage.setItem('elren_api_configs', '[{"id":"keep"}]');
    window.localStorage.setItem('elren:local:other:elren_project_name', '另一个项目');
    await deleteWorkspaceProject({ id: 'local-default', name: '默认项目' });
    expect(api).not.toHaveBeenCalled();
    expect(removeLibraryEntry).toHaveBeenCalledWith('project:local-default', 'local');
    expect(databases.has('elren_autosave_db')).toBe(false);
    expect(storedKeys().sort()).toEqual(['elren:local:other:elren_project_name', 'elren_api_configs']);
});

it('lists a local canvas saved before the workspace became the entry page', async () => {
    session.platform = false;
    window.localStorage.setItem('elren_autosave_meta', JSON.stringify({ storage: 'idb', timestamp: 1234 }));
    window.localStorage.setItem('elren_project_name', '早期画布');
    expect(await listWorkspaceProjects()).toEqual([expect.objectContaining({ id: 'local-default', name: '早期画布', updatedAt: 1234 })]);
    window.localStorage.clear();
    expect(await listWorkspaceProjects()).toEqual([]);
});
