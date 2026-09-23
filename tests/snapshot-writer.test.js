import { expect, it, vi } from 'vitest';
import { createSnapshotWriter, readSnapshotJournal } from '@/lib/snapshot-writer';

const snapshot = text => ({ nodes: [{ id: 'text', type: 'text-node', settings: { text } }], connections: [] });
const memory = () => { const values = new Map(); return { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) }; };
it('restores a just-inserted node before asynchronous persistence completes', async () => {
    const storage = memory();
    let finish;
    const write = vi.fn(() => new Promise(resolve => { finish = resolve; }));
    const writer = createSnapshotWriter({ storage, prepare: async value => value, write });
    writer.schedule(snapshot('立即刷新'));
    expect(readSnapshotJournal(storage).nodes[0].settings.text).toBe('立即刷新');
    await Promise.resolve();
    finish(); await writer.flush();
    expect(writer.dirty).toBe(false);
});
it('skips an obsolete slow preparation so it cannot overwrite a newer edit', async () => {
    const storage = memory(), written = [];
    let finish;
    const prepare = vi.fn().mockImplementationOnce(value => new Promise(resolve => { finish = () => resolve(value); })).mockImplementation(async value => value);
    const writer = createSnapshotWriter({ storage, prepare, write: async payload => written.push(JSON.parse(payload)) });
    writer.schedule(snapshot('旧内容'));
    writer.schedule(snapshot('新内容'));
    finish(); await writer.flush();
    expect(written.map(value => value.nodes[0].settings.text)).toEqual(['新内容']);
    expect(readSnapshotJournal(storage).nodes[0].settings.text).toBe('新内容');
});
it('keeps the newer journal while an older database write is already in flight', async () => {
    const storage = memory(); let release; let first = true;
    const writer = createSnapshotWriter({ storage, prepare: async value => value, write: async () => { if (first) { first = false; await new Promise(resolve => { release = resolve; }); } } });
    writer.schedule(snapshot('旧')); await Promise.resolve();
    writer.schedule(snapshot('新'));
    expect(readSnapshotJournal(storage).nodes[0].settings.text).toBe('新');
    release(); await writer.flush();
    expect(readSnapshotJournal(storage).nodes[0].settings.text).toBe('新');
});
it('reports storage failure and leaves an unresolved runtime asset dirty', async () => {
    const statuses = [], storage = { getItem: () => null, setItem: () => { throw new Error('配额已满'); } };
    const writer = createSnapshotWriter({ storage, prepare: async value => value, write: async () => { throw new Error('保存失败'); }, onStatus: value => statuses.push(value) });
    writer.schedule(snapshot('内容'));
    await expect(writer.flush()).rejects.toThrow('保存失败');
    expect(writer.dirty).toBe(true); expect(statuses.at(-1)).toBe('error');
    const blobs = createSnapshotWriter({ storage: memory(), prepare: async value => value, write: vi.fn() });
    blobs.schedule({ nodes: [{ content: 'blob:temporary' }], connections: [] });
    await expect(blobs.flush()).rejects.toThrow('素材尚未保存');
    expect(blobs.dirty).toBe(true);
});
it('an editor closed during media preparation cannot overwrite its replacement editor', async () => {
    const storage = memory(), written = []; let release;
    const old = createSnapshotWriter({ storage, prepare: value => new Promise(resolve => { release = () => resolve(value); }), write: async value => written.push(value) });
    old.schedule(snapshot('旧页面')); old.dispose();
    const next = createSnapshotWriter({ storage, prepare: async value => value, write: async value => written.push(value) });
    next.schedule(snapshot('重新打开后编辑'));
    release(); await next.flush();
    expect(written).toHaveLength(1);
    expect(readSnapshotJournal(storage).nodes[0].settings.text).toBe('重新打开后编辑');
});
it('waits for the database commit before confirming a media-heavy template is saved', async () => {
    const storage = memory(); let release; let confirmed = false; let saved;
    const writer = createSnapshotWriter({ storage, prepare: async value => value, write: payload => new Promise(resolve => { release = () => { saved = JSON.parse(payload); resolve(); }; }) });
    writer.schedule({ nodes: [{ id: 'photo', content: 'data:image/png;base64,' + 'a'.repeat(1024 * 1024) }, { id: 'template-node' }], connections: [] });
    const confirmation = writer.flush().then(() => { confirmed = true; });
    await Promise.resolve();
    expect(readSnapshotJournal(storage)).toBe(null);
    expect(confirmed).toBe(false);
    expect(writer.dirty).toBe(true);
    release(); await confirmation;
    expect(saved.nodes.map(node => node.id)).toEqual(['photo', 'template-node']);
    expect(writer.dirty).toBe(false);
});
it('does not publish the same saving state for every snapshot revision', async () => {
    const status = vi.fn(); let release;
    const writer = createSnapshotWriter({ storage: memory(), onStatus: status,
        prepare: value => new Promise(resolve => { release = () => resolve(value); }), write: async () => {} });
    writer.schedule(snapshot('新节点'));
    writer.schedule(snapshot('初始设置'));
    expect(status.mock.calls).toEqual([['saving']]);
    writer.dispose(); release();
});
