import { getPlatformContext, platformEnabled } from './platformContext';

const databases = new Map();
export function libraryScope() {
    if (!platformEnabled) return 'local';
    const userId = getPlatformContext()?.user?.id;
    if (!userId) throw new Error('请先登录再使用个人库');
    return userId;
}
function openDatabase(scope = libraryScope()) {
    if (scope !== libraryScope()) return Promise.reject(new Error('账号已切换，请重新打开个人库'));
    if (!window.indexedDB) return Promise.resolve(null);
    const name = `elren:library:v1:${scope}`;
    if (!databases.has(name)) {
        const promise = new Promise((resolve, reject) => {
            const request = indexedDB.open(name, 1);
            request.onupgradeneeded = () => {
                const store = request.result.createObjectStore('entries', { keyPath: 'id' });
                store.createIndex('kind', 'kind');
            };
            request.onsuccess = () => {
                request.result.onversionchange = () => { request.result.close(); databases.delete(name); };
                resolve(request.result);
            };
            request.onerror = () => { databases.delete(name); reject(request.error); };
        });
        databases.set(name, promise);
    }
    return databases.get(name);
}
export async function listLibraryEntries(scope) {
    const db = await openDatabase(scope);
    if (!db) return [];
    return new Promise((resolve, reject) => {
        const request = db.transaction('entries', 'readonly').objectStore('entries').getAll();
        request.onsuccess = () => resolve(request.result.sort((a, b) => b.updatedAt - a.updatedAt));
        request.onerror = () => reject(request.error);
    });
}
export async function saveLibraryEntry(entry, scope) {
    const db = await openDatabase(scope);
    if (!db) throw new Error('此浏览器无法保存个人库，请检查浏览器存储权限');
    const record = { ...entry, id: entry.id || crypto.randomUUID(), updatedAt: Date.now() };
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('entries', 'readwrite');
        transaction.objectStore('entries').put(record);
        transaction.oncomplete = () => resolve(record);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error || new Error('保存未完成'));
    });
}
export async function removeLibraryEntry(id, scope) {
    const db = await openDatabase(scope);
    if (!db) throw new Error('此浏览器无法访问个人库');
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('entries', 'readwrite');
        transaction.objectStore('entries').delete(id);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });
}
