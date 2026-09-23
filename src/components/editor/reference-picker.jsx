import React, { useEffect, useState } from 'react';
import { Check, Image, List, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';

export function ReferencePicker({ targetLabel, candidates, connectedIds = [], onSelect, onClose, ImageComponent = 'img' }) {
    const [query, setQuery] = useState('');
    useEffect(() => {
        const key = event => {
            if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); onClose(); }
            else if (!event.target.closest?.('input, [contenteditable="true"]') && ['Delete', 'Backspace', 'z', 'Z'].includes(event.key)) event.stopImmediatePropagation();
        };
        window.addEventListener('keydown', key, true);
        return () => window.removeEventListener('keydown', key, true);
    }, [onClose]);
    const options = candidates.filter(item => !item.error && `${item.label} ${item.summary}`.toLowerCase().includes(query.toLowerCase()));
    return <section aria-label="从画布选择参考" data-reference-picker className="fixed left-1/2 top-4 z-[90] flex max-w-[calc(100vw-32px)] -translate-x-1/2 items-center gap-2 rounded-2xl border border-border bg-popover px-3 py-2 text-sm shadow-sm"
        onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
        <span className="truncate">为 {targetLabel} 选择参考</span>
        <span className="hidden text-xs text-muted-foreground sm:block">点击空白或 Esc 退出</span>
        <Popover><PopoverTrigger asChild><Button variant="ghost" size="sm"><List size={15} />参考列表</Button></PopoverTrigger>
            <PopoverContent className="w-96 max-w-[calc(100vw-32px)] p-2" align="center" sideOffset={12} onKeyDown={e => e.stopPropagation()}>
                <Input aria-label="搜索参考" placeholder="搜索名称或内容" value={query} onChange={e => setQuery(e.target.value)} />
                <ScrollArea className="mt-2" viewportClassName="max-h-[min(50vh,360px)]">
                    {options.map(item => <Button key={item.id} variant="ghost" className="h-auto w-full justify-start gap-3 whitespace-normal p-2 text-left" onClick={() => onSelect(item.node)}>
                        {item.thumbnail ? <ImageComponent src={item.thumbnail} alt={item.label} className="h-14 w-14 shrink-0 rounded-lg object-cover" /> : <Image className="h-14 w-14 shrink-0 rounded-lg bg-muted p-4 text-muted-foreground" />}
                        <span className="min-w-0 flex-1"><span className="block truncate text-sm">{item.label}</span><span className="block truncate text-xs text-muted-foreground">{connectedIds.includes(item.id) ? '已连接 · 返回编辑' : item.ready ? item.status : `${item.status} · 查看节点`}</span></span>
                        {connectedIds.includes(item.id) && <Check size={16} />}
                    </Button>)}
                    {!options.length && <p className="p-5 text-center text-sm text-muted-foreground">没有匹配的参考内容</p>}
                </ScrollArea>
            </PopoverContent>
        </Popover>
        <Button variant="ghost" size="sm" onClick={onClose}><X size={15} />退出</Button>
    </section>;
}
