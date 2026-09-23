import React, { useState, useRef } from 'react';
import { FolderOpen, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverTrigger } from '@/components/ui/popover';
import { GenerationPopover } from './generation-controls';
import { ScrollArea } from '@/components/ui/scroll-area';

export function StoryboardFramePicker({ label, selected, candidates, onSelect, onUpload, compact = false, ImageComponent = 'img' }) {
    const [open, setOpen] = useState(false), [query, setQuery] = useState('');
    const input = useRef(null);
    const filtered = candidates.filter(item => item.label.toLowerCase().includes(query.trim().toLowerCase()));
    return <>
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild><Button type="button" variant="ghost" aria-label={`选择${label}`}
                onClick={event => event.stopPropagation()} onMouseDown={event => event.stopPropagation()}
                className={`absolute inset-0 z-10 h-full w-full rounded-[inherit] ${compact ? 'p-1' : ''} ${selected ? 'opacity-0 hover:opacity-100 focus-visible:opacity-100' : ''}`}>
                <span className={compact ? 'max-w-full rounded-md bg-background/85 px-1 py-1 text-[10px] leading-tight' : 'rounded-lg bg-background/85 px-3 py-2 text-xs'}><FolderOpen size={16} className="mx-auto mb-1" />{compact ? (selected ? '更换' : label === '新增参考图' ? '添加参考' : label) : `${selected ? '更换' : '选择'}${label}`}</span>
            </Button></PopoverTrigger>
            <GenerationPopover aria-label={`${label}素材`} className="w-80 space-y-3" onOpenAutoFocus={event => event.preventDefault()}>
                <div className="relative"><Search size={14} className="absolute left-3 top-3 text-muted-foreground" /><Input aria-label={`搜索${label}`} placeholder="搜索画布图片…" value={query} onChange={event => setQuery(event.target.value)} className="pl-8" /></div>
                <ScrollArea className="h-64">
                    <div className="space-y-1 pr-2">{filtered.map(item => <Button type="button" key={item.id} variant="ghost" disabled={!item.ready}
                        className="h-auto w-full justify-start gap-3 px-2 py-2 text-left" onClick={() => { onSelect(item); setOpen(false); }}>
                        {item.url ? <ImageComponent src={item.url} alt="" className="h-14 w-12 shrink-0 rounded object-cover" /> : <span className="h-14 w-12 shrink-0 rounded bg-muted" />}
                        <span className="min-w-0"><span className="block truncate text-xs">{item.label}</span><span className="block text-[11px] font-normal text-muted-foreground">{item.status}</span></span>
                    </Button>)}{!filtered.length && <p role="status" className="py-8 text-center text-xs text-muted-foreground">{query ? '没有匹配的图片' : '画布中暂无图片'}</p>}</div>
                </ScrollArea>
                <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => input.current?.click()}>从本地上传{label}</Button>
            </GenerationPopover>
        </Popover>
        <input ref={input} type="file" accept="image/*" className="hidden" aria-label={`上传${label}`} onChange={event => { onUpload(event); setOpen(false); }} />
    </>;
}
