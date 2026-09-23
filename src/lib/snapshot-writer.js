export const JOURNAL_KEY = 'elren_autosave_journal';

export function readSnapshotJournal(storage, timestamp = 0) {
    try {
        const value = JSON.parse(storage.getItem(JOURNAL_KEY) || 'null');
        return value && Array.isArray(value.nodes) && Array.isArray(value.connections) && value.timestamp >= timestamp ? value : null;
    } catch { return null; }
}

// Serializes commits and keeps a synchronous checkpoint for refresh before IndexedDB commits.
export function createSnapshotWriter({ storage, prepare, write, onStatus = () => {}, debounceMs = 0 }) {
    let revision = 0, pending = null, running = null, durable = 0, lastError = null, closed = false;
    let lastStatus;
    const reportStatus = status => {
        if (lastStatus === status) return;
        lastStatus = status;
        onStatus(status);
    };
    const checkpoint = snapshot => {
        // Avoid serializing multi-megabyte embedded media on every keystroke or drag frame.
        let size = 0;
        const small = value => {
            if (typeof value === 'string') size += value.length;
            else if (Array.isArray(value)) return value.every(small);
            else if (value && typeof value === 'object') return Object.values(value).every(small);
            return size <= 1024 * 1024;
        };
        if (!small(snapshot)) return false;
        const payload = JSON.stringify(snapshot);
        if (payload.includes('"blob:')) return false; // Runtime URLs need asynchronous stabilization first.
        try { storage.setItem(JOURNAL_KEY, payload); return true; } catch { return false; }
    };
    async function drain() {
        while (pending) {
            if (debounceMs) await new Promise(resolve => setTimeout(resolve, debounceMs));
            if (closed || !pending) break;
            const current = pending;
            pending = null;
            try {
                const safe = await prepare(current.snapshot);
                if (closed || current.revision !== revision) continue;
                if (JSON.stringify(safe).includes('"blob:')) throw new Error('素材尚未保存，请保留当前页面后重试');
                const local = checkpoint(safe);
                try { await write(JSON.stringify(safe)); }
                catch (error) { if (!local) throw error; }
                if (!closed && current.revision === revision) {
                    durable = revision;
                    lastError = null;
                    reportStatus('saved');
                }
            } catch (error) {
                if (!closed && current.revision === revision) { lastError = error; reportStatus('error'); }
            }
        }
    }
    function start() {
        if (!running) running = drain().finally(() => { running = null; if (pending) start(); });
        return running;
    }
    return {
        schedule(snapshot) {
            if (closed) return;
            revision++;
            lastError = null;
            const value = { ...snapshot, timestamp: Math.max(Date.now(), snapshot.timestamp || 0) };
            pending = { snapshot: value, revision };
            if (checkpoint(value)) durable = revision;
            reportStatus('saving');
            start();
        },
        async flush() {
            while (running || pending) await (running || start());
            if (lastError || durable !== revision) throw lastError || new Error('项目尚未保存');
        },
        dispose() { closed = true; pending = null; },
        get dirty() { return durable !== revision; },
    };
}
