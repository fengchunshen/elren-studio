import React, { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
export function MediaUploadButton({ accept, label, onFile }) {
    const input = useRef(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
    return <><Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => input.current?.click()}>{busy ? '读取中…' : label}</Button><input ref={input} type="file" accept={accept} className="hidden" onChange={async event => { const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; setBusy(true); setError(''); try { await onFile(file); } catch(e) { setError(e.message); } finally { setBusy(false); } }} />{error && <p role="alert" className="text-xs text-destructive">{error}</p>}</>;
}
