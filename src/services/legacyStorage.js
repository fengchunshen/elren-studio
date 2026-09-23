// Browser data written before the Elren rename used "tapnow" in localStorage keys,
// IndexedDB names and two stored URL forms. This module moves that data once; the
// rest of the code base only knows the Elren names.
const LEGACY = 'tapnow';
const CURRENT = 'elren';
const LOCAL_DONE = 'elren:legacy-migration:local-storage';
const INDEXED_DB_DONE = 'elren:legacy-migration:indexeddb';
const COPYING = 'elren:legacy-migration:copying:';
const BLOCKED = '本地数据正在被其他 Elren 标签页使用，请关闭其他标签页后刷新';
// Image records can be several megabytes each; keep each read/write round small.
const BATCH = 25;

export const renameLegacy = name => name.replaceAll(LEGACY, CURRENT);

export const migrateLegacyText = text => text
    .replaceAll(`.${LEGACY}_cache`, `.${CURRENT}_cache`)
    .replaceAll(`${LEGACY}-model://`, `${CURRENT}-model://`);

// Rewrites strings, including object keys such as asset-manifest URLs. Blobs and other
// structured-clone values are kept as they are.
export function migrateLegacyValue(value) {
    if (typeof value === 'string') return migrateLegacyText(value);
    if (Array.isArray(value)) return value.map(migrateLegacyValue);
    if (value && Object.getPrototypeOf(value) === Object.prototype) {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [migrateLegacyText(key), migrateLegacyValue(item)]));
    }
    return value;
}

export function migrateLegacyLocalStorage(storage = window.localStorage) {
    if (storage.getItem(LOCAL_DONE)) return;
    const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter(key => key?.includes(LEGACY));
    for (const key of keys) {
        const value = storage.getItem(key);
        const target = renameLegacy(key);
        // Never overwrite data that already exists under the new name.
        if (value === null || storage.getItem(target) !== null) continue;
        const next = migrateLegacyText(value);
        try {
            storage.setItem(target, next);
            storage.removeItem(key);
        } catch (error) {
            // Near the quota: free the old entry first. The new key and value are never longer.
            storage.removeItem(key);
            try { storage.setItem(target, next); } catch { storage.setItem(key, value); throw error; }
        }
    }
    storage.setItem(LOCAL_DONE, '1');
}

const settle = request => new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
});
const completion = transaction => new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error('IndexedDB 事务未完成'));
});

// Opening without a version creates a missing database; abort that upgrade so it stays absent.
function openExisting(idb, name) {
    return new Promise((resolve, reject) => {
        const request = idb.open(name);
        let missing = false;
        request.onupgradeneeded = () => { missing = true; request.transaction.abort(); };
        request.onsuccess = () => resolve(request.result);
        request.onerror = event => {
            if (!missing) return reject(request.error);
            event.preventDefault?.();
            resolve(null);
        };
    });
}

function deleteDatabase(idb, name) {
    return new Promise((resolve, reject) => {
        const request = idb.deleteDatabase(name);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error(BLOCKED));
    });
}

async function legacyDatabaseNames(idb, storage) {
    if (typeof idb.databases === 'function') {
        return (await idb.databases()).map(item => item.name).filter(name => name?.includes(LEGACY));
    }
    // Browsers without databases(): derive candidates from the already migrated project keys.
    const prefixes = new Set(['']);
    const scopes = new Set(['local']);
    for (let index = 0; index < storage.length; index += 1) {
        const match = /^elren:(v2:([^:]+):[^:]+|local:[^:]+):/.exec(storage.key(index) || '');
        if (!match) continue;
        prefixes.add(`${LEGACY}:${match[1]}:`);
        if (match[2]) scopes.add(match[2]);
    }
    return [
        ...[...prefixes].flatMap(prefix => [`${prefix}${LEGACY}_images_db`, `${prefix}${LEGACY}_autosave_db`]),
        ...[...scopes].map(scope => `${LEGACY}:library:v1:${scope}`),
    ];
}

const countRecords = (db, store) => settle(db.transaction(store, 'readonly').objectStore(store).count());

async function copyDatabase(idb, keyRange, source, targetName) {
    const stores = [...source.objectStoreNames].map(name => {
        const store = source.transaction(name, 'readonly').objectStore(name);
        return {
            name, keyPath: store.keyPath, autoIncrement: store.autoIncrement,
            indexes: [...store.indexNames].map(indexName => {
                const index = store.index(indexName);
                return { name: indexName, keyPath: index.keyPath, unique: index.unique, multiEntry: index.multiEntry };
            }),
        };
    });
    const request = idb.open(targetName, source.version);
    request.onupgradeneeded = () => {
        for (const store of stores) {
            const created = request.result.createObjectStore(store.name, { keyPath: store.keyPath ?? undefined, autoIncrement: store.autoIncrement });
            for (const index of store.indexes) created.createIndex(index.name, index.keyPath, { unique: index.unique, multiEntry: index.multiEntry });
        }
    };
    const target = await new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error(BLOCKED));
    });
    try {
        for (const store of stores) {
            let after;
            for (;;) {
                const range = after === undefined ? undefined : keyRange.lowerBound(after, true);
                const reader = source.transaction(store.name, 'readonly').objectStore(store.name);
                const [keys, values] = await Promise.all([settle(reader.getAllKeys(range, BATCH)), settle(reader.getAll(range, BATCH))]);
                if (!keys.length) break;
                const transaction = target.transaction(store.name, 'readwrite');
                const writer = transaction.objectStore(store.name);
                values.forEach((value, index) => {
                    if (store.keyPath === null) writer.put(migrateLegacyValue(value), keys[index]);
                    else writer.put(migrateLegacyValue(value));
                });
                await completion(transaction);
                after = keys[keys.length - 1];
            }
            if (await countRecords(source, store.name) !== await countRecords(target, store.name)) {
                throw new Error(`本地数据迁移校验失败：${targetName}/${store.name}`);
            }
        }
    } finally { target.close(); }
}

export async function migrateLegacyIndexedDb({ idb = window.indexedDB, keyRange = window.IDBKeyRange, storage = window.localStorage } = {}) {
    if (!idb || storage.getItem(INDEXED_DB_DONE)) return;
    for (const name of await legacyDatabaseNames(idb, storage)) {
        const target = renameLegacy(name);
        const marker = COPYING + target;
        const interrupted = storage.getItem(marker) !== null;
        if (!interrupted) {
            const existing = await openExisting(idb, target);
            // Data already lives under the new name: keep both copies untouched.
            if (existing) { existing.close(); continue; }
        }
        const source = await openExisting(idb, name);
        if (!source) continue;
        try {
            storage.setItem(marker, '1');
            if (interrupted) await deleteDatabase(idb, target);
            await copyDatabase(idb, keyRange, source, target);
            storage.removeItem(marker);
        } finally { source.close(); }
        // The copy is verified. A delete blocked by another tab completes once it closes.
        await new Promise(resolve => {
            const request = idb.deleteDatabase(name);
            request.onsuccess = request.onerror = request.onblocked = () => resolve();
        });
    }
    storage.setItem(INDEXED_DB_DONE, '1');
}
