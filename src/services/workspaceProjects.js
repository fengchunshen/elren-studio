import { api } from './apiClient';
import { getPlatformContext, platformEnabled } from './platformContext';
import { libraryScope, listLibraryEntries, saveLibraryEntry, removeLibraryEntry } from './workspaceLibrary';
import { sanitizeImportedProject } from './projectStorage';
import { readSnapshotJournal, JOURNAL_KEY } from '@/lib/snapshot-writer';
import { canvasPath, canvasProjectId, workspacePath } from '@/lib/project-route';

// The workspace page has no open project; the canvas always carries its project in the URL.
export const currentWorkspaceProjectId = () => platformEnabled ? getPlatformContext()?.project?.id ?? null : canvasProjectId() || 'local-default';
export function workspaceProjectPrefix(id, scope = libraryScope()) {
    return platformEnabled ? `elren:v2:${scope}:${id}:` : id === 'local-default' ? '' : `elren:local:${id}:`;
}
function assertScope(scope) { if (scope !== libraryScope()) throw new Error('账号已切换，请重新打开工作空间'); }
function openSnapshot(id, scope) {
    assertScope(scope);
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(`${workspaceProjectPrefix(id, scope)}elren_autosave_db`, 1);
        request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('autosave')) request.result.createObjectStore('autosave'); };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}
export async function writeWorkspaceSnapshot(id, snapshot, scope = libraryScope()) {
    const db = await openSnapshot(id, scope);
    try {
        assertScope(scope);
        await new Promise((resolve, reject) => {
            const tx = db.transaction('autosave', 'readwrite');
            tx.objectStore('autosave').put(JSON.stringify(snapshot), 'latest');
            tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('项目保存未完成'));
        });
        assertScope(scope);
        const prefix = workspaceProjectPrefix(id, scope);
        window.localStorage.setItem(`${prefix}elren_autosave_meta`, JSON.stringify({ storage: 'idb', timestamp: snapshot.timestamp || Date.now() }));
        window.localStorage.setItem(`${prefix}elren_project_name`, snapshot.projectName || '未命名项目');
        window.localStorage.setItem(`${prefix}elren_canvas_annotations`, JSON.stringify(snapshot.annotations || []));
        window.localStorage.setItem(`${prefix}elren_workspace_view`, JSON.stringify(snapshot.view || { x: 0, y: 0, zoom: 1 }));
    } finally { db.close(); }
}
async function readSnapshot(id, scope) {
    const prefix = workspaceProjectPrefix(id, scope);
    const meta = JSON.parse(window.localStorage.getItem(`${prefix}elren_autosave_meta`) || 'null');
    const journal = readSnapshotJournal({ getItem: key => window.localStorage.getItem(prefix + key) }, meta?.timestamp || 0);
    if (journal) return journal;
    let result;
    const db = await openSnapshot(id, scope);
    try {
        result = await new Promise((resolve, reject) => {
            const request = db.transaction('autosave', 'readonly').objectStore('autosave').get('latest');
            request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
        });
    } finally { db.close(); }
    const local = window.localStorage;
    const snapshot = JSON.parse((meta?.storage === 'local' ? local.getItem(`${prefix}elren_autosave`) : result || local.getItem(`${prefix}elren_autosave`)) || 'null') || {
        nodes: JSON.parse(local.getItem(`${prefix}elren_nodes`) || '[]'), connections: JSON.parse(local.getItem(`${prefix}elren_connections`) || '[]'),
    };
    return { ...snapshot, annotations: JSON.parse(local.getItem(`${prefix}elren_canvas_annotations`) || '[]') };
}
export async function rememberWorkspaceProject(project, scope = libraryScope()) {
    return saveLibraryEntry({ ...project, id: `project:${project.projectId}`, kind: 'project' }, scope);
}
// Local canvases created before the workspace became the entry page live in the unprefixed default project
// and may never have been registered in the library.
function unregisteredDefaultProject(stored) {
    const local = window.localStorage;
    if (platformEnabled || stored.some(entry => entry.projectId === 'local-default')) return [];
    const meta = JSON.parse(local.getItem('elren_autosave_meta') || 'null');
    if (!meta && !local.getItem('elren_nodes') && !local.getItem(JOURNAL_KEY)) return [];
    return [{ projectId: 'local-default', name: local.getItem('elren_project_name') || '未命名项目', updatedAt: meta?.timestamp || 0 }];
}
export async function listWorkspaceProjects() {
    const scope = libraryScope();
    const registered = (await listLibraryEntries(scope)).filter(entry => entry.kind === 'project');
    const stored = [...registered, ...unregisteredDefaultProject(registered)];
    const projects = platformEnabled ? (await api('/projects')).items : stored.map(entry => ({ id: entry.projectId, name: entry.name }));
    assertScope(scope);
    return projects.filter(project => !project.archived).map(project => ({
        ...stored.find(entry => entry.projectId === project.id), ...project,
        updatedAt: stored.find(entry => entry.projectId === project.id)?.updatedAt || project.created_at * 1000 || 0,
    })).sort((a, b) => b.updatedAt - a.updatedAt);
}
export async function createWorkspaceProject(name, copyFrom) {
    const scope = libraryScope();
    const clean = name.trim().slice(0, 200);
    if (!clean) throw new Error('请输入项目名称');
    const available = copyFrom ? await listWorkspaceProjects() : [];
    if (copyFrom && !available.some(project => project.id === copyFrom)) throw new Error('无法访问这个项目');
    const snapshot = copyFrom ? sanitizeImportedProject(await readSnapshot(copyFrom, scope)) : { nodes: [], connections: [], annotations: [] };
    assertScope(scope);
    const project = platformEnabled ? await api('/projects', { method: 'POST', body: { name: clean } }) : { id: crypto.randomUUID(), name: clean };
    await writeWorkspaceSnapshot(project.id, { ...snapshot, projectName: clean, timestamp: Date.now() }, scope);
    await rememberWorkspaceProject({ projectId: project.id, name: clean, cover: available.find(item => item.id === copyFrom)?.cover || '', nodeCount: snapshot.nodes.length }, scope);
    return project;
}
export async function renameWorkspaceProject(project, name) {
    const scope = libraryScope();
    const clean = name.trim().slice(0, 200);
    if (!clean) throw new Error('请输入项目名称');
    if (platformEnabled) await api(`/projects/${project.id}`, { method: 'PATCH', body: { name: clean, archived: false } });
    assertScope(scope);
    window.localStorage.setItem(`${workspaceProjectPrefix(project.id, scope)}elren_project_name`, clean);
    await rememberWorkspaceProject({ ...project, projectId: project.id, name: clean }, scope);
    if (platformEnabled && getPlatformContext()?.project?.id === project.id) getPlatformContext().project.name = clean;
    return clean;
}
// The default local project shares unprefixed keys with browser-wide settings, so only its canvas content is cleared.
const PROJECT_CONTENT_KEYS = ['elren_autosave', 'elren_autosave_meta', JOURNAL_KEY, 'elren_nodes', 'elren_connections', 'elren_canvas_annotations', 'elren_workspace_view', 'elren_project_name'];
const PROJECT_DATABASES = ['elren_autosave_db', 'elren_images_db'];
function deleteDatabase(name) {
    return new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase(name);
        // Another tab may still hold the project open; the browser finishes deletion once it closes.
        request.onsuccess = request.onblocked = () => resolve();
        request.onerror = () => reject(request.error);
    });
}
export async function deleteWorkspaceProject(project) {
    const scope = libraryScope();
    if (project.id === canvasProjectId()) throw new Error('当前打开的项目不能删除');
    if (platformEnabled) await api(`/projects/${project.id}`, { method: 'PATCH', body: { name: project.name, archived: true } });
    assertScope(scope);
    await removeLibraryEntry(`project:${project.id}`, scope);
    const prefix = workspaceProjectPrefix(project.id, scope), local = window.localStorage;
    if (!prefix) {
        PROJECT_CONTENT_KEYS.forEach(key => local.removeItem(key));
        await deleteDatabase('elren_autosave_db');
        return;
    }
    Array.from({ length: local.length }, (_, index) => local.key(index)).filter(key => key?.startsWith(prefix)).forEach(key => local.removeItem(key));
    const names = new Set(PROJECT_DATABASES.map(name => prefix + name));
    if (indexedDB.databases) (await indexedDB.databases()).forEach(({ name }) => { if (name?.startsWith(prefix)) names.add(name); });
    await Promise.all([...names].map(deleteDatabase));
}
// One at a time so a failure leaves the rest reportable; an account switch fails the remainder untouched.
export async function deleteWorkspaceProjects(projects) {
    const scope = libraryScope(), deleted = [], failed = [];
    for (const project of projects) {
        try { assertScope(scope); await deleteWorkspaceProject(project); deleted.push(project); } catch (error) { failed.push({ project, error }); }
    }
    return { deleted, failed };
}
// The editor pins storage and caches to one project per page load, so switching always reloads.
export const openCanvasProject = id => window.location.assign(canvasPath(id));
export const openWorkspacePage = (create = false) => window.location.assign(workspacePath(create));
