import { beforeEach, expect, it } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { migrateLegacyIndexedDb, migrateLegacyLocalStorage, migrateLegacyValue } from '@/services/legacyStorage';

const OLD = 'tapnow';
const settle = request => new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });

function memoryStorage(limit = Infinity) {
    const values = new Map();
    const size = () => [...values].reduce((total, [key, value]) => total + key.length + value.length, 0);
    return {
        values,
        getItem: key => values.get(key) ?? null,
        setItem(key, value) {
            const previous = values.get(key);
            values.set(key, String(value));
            if (size() > limit) {
                if (previous === undefined) values.delete(key); else values.set(key, previous);
                throw new DOMException('quota', 'QuotaExceededError');
            }
        },
        removeItem: key => values.delete(key),
        key: index => [...values.keys()][index] ?? null,
        get length() { return values.size; },
    };
}

async function createDatabase(idb, name, version, setup, fill) {
    const request = idb.open(name, version);
    request.onupgradeneeded = () => setup(request.result);
    const db = await settle(request);
    const tx = db.transaction([...db.objectStoreNames], 'readwrite');
    fill(tx);
    await new Promise(resolve => { tx.oncomplete = resolve; });
    db.close();
}

async function readAll(idb, name, store) {
    const db = await settle(idb.open(name));
    const reader = db.transaction(store).objectStore(store);
    const [keys, values] = await Promise.all([settle(reader.getAllKeys()), settle(reader.getAll())]);
    const schema = { version: db.version, keyPath: reader.keyPath, indexes: [...reader.indexNames] };
    db.close();
    return { keys, values, schema };
}

const names = async idb => (await idb.databases()).map(item => item.name).sort();

let idb;
let storage;
beforeEach(() => { idb = new IDBFactory(); storage = memoryStorage(); });

it('moves every legacy localStorage key and rewrites stored cache paths and model URLs', () => {
    storage.setItem(`${OLD}_theme`, 'light');
    storage.setItem(`${OLD}:local-project`, 'draft');
    storage.setItem(`${OLD}:v2:u1:p1:${OLD}_history`, JSON.stringify([{ url: `http://127.0.0.1:9527/file/.${OLD}_cache/history/a.jpg`, model: `${OLD}-model://m1` }]));
    storage.setItem(`${OLD}:project:u1`, 'p1');
    storage.setItem('i18nextLng', 'zh');
    migrateLegacyLocalStorage(storage);
    expect(Object.fromEntries(storage.values)).toEqual({
        elren_theme: 'light',
        'elren:local-project': 'draft',
        'elren:v2:u1:p1:elren_history': JSON.stringify([{ url: 'http://127.0.0.1:9527/file/.elren_cache/history/a.jpg', model: 'elren-model://m1' }]),
        'elren:project:u1': 'p1',
        i18nextLng: 'zh',
        'elren:legacy-migration:local-storage': '1',
    });
});

it('never overwrites a value that already uses the new name and runs only once', () => {
    storage.setItem(`${OLD}_theme`, 'light');
    storage.setItem('elren_theme', 'dark');
    migrateLegacyLocalStorage(storage);
    expect(storage.getItem('elren_theme')).toBe('dark');
    expect(storage.getItem(`${OLD}_theme`)).toBe('light');
    storage.setItem(`${OLD}_history`, '[]');
    migrateLegacyLocalStorage(storage);
    expect(storage.getItem(`${OLD}_history`)).toBe('[]');
});

it('frees the old entry first when both copies would exceed the storage quota', () => {
    const large = 'x'.repeat(400);
    const marker = 'elren:legacy-migration:local-storage';
    // Room for one copy plus the completion marker, not for both copies.
    storage = memoryStorage(`${OLD}_history`.length + large.length + marker.length + 10);
    storage.setItem(`${OLD}_history`, large);
    migrateLegacyLocalStorage(storage);
    expect(storage.getItem('elren_history')).toBe(large);
    expect(storage.getItem(`${OLD}_history`)).toBeNull();
    expect(storage.getItem(marker)).toBe('1');
});

it('copies legacy IndexedDB databases with schema, batches and rewritten values, then removes them', async () => {
    const images = `${OLD}:v2:u1:p1:${OLD}_images_db`;
    const autosave = `${OLD}:v2:u1:p1:${OLD}_autosave_db`;
    const library = `${OLD}:library:v1:u1`;
    await createDatabase(idb, images, 3, db => db.createObjectStore('images', { keyPath: 'id' }).createIndex('timestamp', 'timestamp'), tx => {
        for (let index = 0; index < 60; index += 1) tx.objectStore('images').put({ id: `img_${String(index).padStart(2, '0')}`, timestamp: index, bytes: new Uint8Array([index, 1, 2]) });
    });
    await createDatabase(idb, autosave, 1, db => db.createObjectStore('autosave'), tx => {
        tx.objectStore('autosave').put(JSON.stringify({ nodes: [{ content: `/file/.${OLD}_cache/history/n.png` }] }), 'latest');
    });
    await createDatabase(idb, library, 1, db => db.createObjectStore('entries', { keyPath: 'id' }).createIndex('kind', 'kind'), tx => {
        tx.objectStore('entries').put({ id: 'project:p1', kind: 'project', assets: { [`/file/.${OLD}_cache/a.png`]: 'assets/a.png' } });
    });

    await migrateLegacyIndexedDb({ idb, keyRange: IDBKeyRange, storage });

    expect(await names(idb)).toEqual(['elren:library:v1:u1', 'elren:v2:u1:p1:elren_autosave_db', 'elren:v2:u1:p1:elren_images_db']);
    const copiedImages = await readAll(idb, 'elren:v2:u1:p1:elren_images_db', 'images');
    expect(copiedImages.schema).toEqual({ version: 3, keyPath: 'id', indexes: ['timestamp'] });
    expect(copiedImages.values).toHaveLength(60);
    expect([...copiedImages.values[59].bytes]).toEqual([59, 1, 2]);
    const copiedAutosave = await readAll(idb, 'elren:v2:u1:p1:elren_autosave_db', 'autosave');
    expect(copiedAutosave.keys).toEqual(['latest']);
    expect(JSON.parse(copiedAutosave.values[0]).nodes[0].content).toBe('/file/.elren_cache/history/n.png');
    const copiedLibrary = await readAll(idb, 'elren:library:v1:u1', 'entries');
    expect(copiedLibrary.values[0].assets).toEqual({ '/file/.elren_cache/a.png': 'assets/a.png' });
    expect(storage.getItem('elren:legacy-migration:indexeddb')).toBe('1');
});

it('keeps both copies when data already exists under the new database name', async () => {
    await createDatabase(idb, `${OLD}_autosave_db`, 1, db => db.createObjectStore('autosave'), tx => tx.objectStore('autosave').put('old', 'latest'));
    await createDatabase(idb, 'elren_autosave_db', 1, db => db.createObjectStore('autosave'), tx => tx.objectStore('autosave').put('new', 'latest'));
    await migrateLegacyIndexedDb({ idb, keyRange: IDBKeyRange, storage });
    expect((await readAll(idb, 'elren_autosave_db', 'autosave')).values).toEqual(['new']);
    expect(await names(idb)).toContain(`${OLD}_autosave_db`);
});

it('replaces a partial copy left by an interrupted migration', async () => {
    await createDatabase(idb, `${OLD}_autosave_db`, 1, db => db.createObjectStore('autosave'), tx => {
        tx.objectStore('autosave').put('a', 'first');
        tx.objectStore('autosave').put('b', 'second');
    });
    await createDatabase(idb, 'elren_autosave_db', 1, db => db.createObjectStore('autosave'), tx => tx.objectStore('autosave').put('a', 'first'));
    storage.setItem('elren:legacy-migration:copying:elren_autosave_db', '1');
    await migrateLegacyIndexedDb({ idb, keyRange: IDBKeyRange, storage });
    expect((await readAll(idb, 'elren_autosave_db', 'autosave')).keys).toEqual(['first', 'second']);
    expect(storage.getItem('elren:legacy-migration:copying:elren_autosave_db')).toBeNull();
    expect(await names(idb)).toEqual(['elren_autosave_db']);
});

it('finds legacy databases from migrated project keys when the browser cannot list databases', async () => {
    await createDatabase(idb, `${OLD}:local:draft:${OLD}_autosave_db`, 1, db => db.createObjectStore('autosave'), tx => tx.objectStore('autosave').put('saved', 'latest'));
    storage.setItem('elren:local:draft:elren_project_name', '草稿');
    const withoutListing = { open: (...args) => idb.open(...args), deleteDatabase: name => idb.deleteDatabase(name) };
    await migrateLegacyIndexedDb({ idb: withoutListing, keyRange: IDBKeyRange, storage });
    expect(await names(idb)).toEqual(['elren:local:draft:elren_autosave_db']);
});

it('rewrites legacy paths inside imported project files, including object keys', () => {
    const blob = new Blob(['x']);
    expect(migrateLegacyValue({ assetManifest: { [`/file/.${OLD}_cache/a.png`]: 'assets/a.png' }, nodes: [{ content: `C:\\data\\.${OLD}_cache\\a.png`, blob }] }))
        .toEqual({ assetManifest: { '/file/.elren_cache/a.png': 'assets/a.png' }, nodes: [{ content: 'C:\\data\\.elren_cache\\a.png', blob }] });
});
