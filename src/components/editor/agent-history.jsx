import React, { useRef, useState } from 'react';
import { ChevronDown, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

function modifiedTime(value) {
    if (!value) return '';
    const minutes = Math.max(0, Math.floor((Date.now() / 1000 - value) / 60));
    if (!minutes) return '刚刚';
    if (minutes < 60) return `${minutes} 分钟前`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)} 小时前`;
    return `${Math.floor(minutes / 1440)} 天前`;
}

export default function AgentHistory({ sessions, currentId, disabled, onSelect, onRefresh, onRename, onDelete }) {
    const [open, setOpen] = useState(false), [editing, setEditing] = useState(null);
    const [draft, setDraft] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
    const editingRef = useRef(null), saving = useRef(null);
    const contentRef = useRef(null), inputRef = useRef(null);
    const save = () => {
        if (saving.current) return saving.current;
        const id = editingRef.current;
        if (!id) return Promise.resolve(true);
        const title = draft.trim();
        if (!title) { setError('请输入对话名称'); return Promise.resolve(false); }
        setBusy(true); setError('');
        saving.current = (async () => {
            try {
                await onRename(id, title);
                if (document.activeElement === inputRef.current) contentRef.current?.focus();
                editingRef.current = null; setEditing(null);
                return true;
            } catch (failure) { setError(failure.message); return false; }
            finally { setBusy(false); saving.current = null; }
        })();
        return saving.current;
    };
    const select = async id => { if (await save()) { onSelect(id); setOpen(false); } };
    return <Popover open={open} onOpenChange={async value => {
        if (value) { setOpen(true); setError(''); onRefresh(); }
        else if (await save()) setOpen(false);
    }}>
        <PopoverTrigger asChild>
            <Button variant="ghost" disabled={disabled} aria-label="创作对话" className="min-w-0 justify-between gap-2">
                <span className="truncate">{sessions.find(item => item.id === currentId)?.title || '新对话'}</span><ChevronDown className="size-4 shrink-0" />
            </Button>
        </PopoverTrigger>
        <PopoverContent ref={contentRef} align="start" className="w-80 max-w-[calc(100vw-32px)] p-2" aria-label="历史对话"
            onKeyDown={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()}
            onEscapeKeyDown={event => { if (editingRef.current) {event.preventDefault(); editingRef.current = null; setEditing(null); setError('');} }}>
            <Button variant="ghost" className="mb-1 w-full justify-start gap-2" disabled={busy} onClick={() => select(null)}><Plus className="size-4" />新建对话</Button>
            <div className="max-h-80 overflow-y-auto" role="group" aria-label="历史对话列表">
                {sessions.map(item => <div key={item.id} className={`agent-history-row group flex min-h-10 items-center gap-2 rounded-xl px-2 hover:bg-muted focus-within:bg-muted ${editing === item.id ? 'bg-muted' : ''}`}>
                    {editing === item.id ?
                        <Input ref={inputRef} autoFocus aria-label="对话名称" maxLength={100} value={draft} readOnly={busy}
                            className="h-9 min-w-0 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0" onFocus={event => event.target.select()}
                            onChange={event => setDraft(event.target.value)} onBlur={() => save()}
                            onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing && event.keyCode !== 229) {event.preventDefault(); save();} }} />
                        :
                        <>
                            <Button variant="ghost" className="min-w-0 flex-1 justify-start px-1" aria-label={`打开对话：${item.title}`} aria-current={currentId === item.id ? 'true' : undefined} disabled={busy} onClick={() => select(item.id)}><span className="truncate">{item.title}</span></Button>
                            <div className="relative flex w-20 shrink-0 items-center justify-end">
                                <time className="agent-history-time text-xs text-muted-foreground group-hover:invisible group-focus-within:invisible" dateTime={item.updated_at ? new Date(item.updated_at * 1000).toISOString() : undefined}>{modifiedTime(item.updated_at)}</time>
                                <div className="agent-history-actions absolute right-0 flex opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto">
                                    <Button size="icon" variant="ghost" className="size-7" aria-label={`编辑对话：${item.title}`} disabled={busy} onClick={() => {editingRef.current = item.id; setEditing(item.id); setDraft(item.title); setError('');}}><Pencil className="size-3.5" /></Button>
                                    <Button size="icon" variant="ghost" className="size-7" aria-label={`删除对话：${item.title}`} disabled={busy || ['running','waiting_canvas','waiting_approval'].includes(item.status)} onClick={async () => {
                                        setBusy(true); setError('');
                                        try { await onDelete(item.id); } catch (failure) { setError(failure.message); } finally {setBusy(false);}
                                    }}><Trash2 className="size-3.5" />
                                    </Button>
                                </div>
                            </div>
                        </>
                    }
                </div>)}
            </div>
            {error && <p role="alert" className="px-2 py-1 text-xs text-destructive">{error}</p>}
        </PopoverContent>
    </Popover>;
}
