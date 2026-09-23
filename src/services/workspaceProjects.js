import { api } from './apiClient';
import { getPlatformContext, platformEnabled } from './platformContext';
import { libraryScope, listLibraryEntries, saveLibraryEntry } from './workspaceLibrary';
import { sanitizeImportedProject } from './projectStorage';
import { readSnapshotJournal } from '@/lib/snapshot-writer';

export const currentWorkspaceProjectId = () => platformEnabled ? getPlatformContext().project.id : window.localStorage.getItem('elren:local-project') || 'local-default';
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
export async function listWorkspaceProjects() {
    const scope = libraryScope();
    const stored = (await listLibraryEntries(scope)).filter(entry => entry.kind === 'project');
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
    if (platformEnabled && getPlatformContext().project.id === project.id) getPlatformContext().project.name = clean;
    return clean;
}
export function activateWorkspaceProject(id) {
    window.localStorage.setItem(platformEnabled ? `elren:project:${libraryScope()}` : 'elren:local-project', id);
    window.location.reload();
}
