import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';

export function CanvasCommentComposer({ draft, view, canvasRef, onChange, onSubmit, onDelete, onClose, onExitMode }) {
    const textareaRef = useRef(null);
    const composingRef = useRef(false);
    const [canvasOrigin, setCanvasOrigin] = useState({ left: 0, top: 0 });
    useLayoutEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const measure = () => {
            const rect = canvas.getBoundingClientRect();
            setCanvasOrigin(previous => previous.left === rect.left && previous.top === rect.top ? previous : { left: rect.left, top: rect.top });
        };
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(canvas);
        window.addEventListener('resize', measure);
        return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
    }, [canvasRef]);
    useLayoutEffect(() => {
        const input = textareaRef.current;
        if (!input) return;
        input.style.height = '32px';
        input.style.height = `${Math.min(160, Math.max(32, input.scrollHeight))}px`;
    }, [draft.text]);
    const anchor = useMemo(() => ({ current: {
        getBoundingClientRect: () => DOMRect.fromRect({
            x: canvasOrigin.left + view.x + draft.x * view.zoom,
            y: canvasOrigin.top + view.y + draft.y * view.zoom,
            width: draft.id ? 32 : 0, height: draft.id ? 32 : 0,
        }),
    } }), [canvasOrigin, view, draft.x, draft.y, draft.id]);
    const canSubmit = Boolean(draft.text.trim()) && draft.text.length <= 200;
    const submit = () => { if (canSubmit && !composingRef.current) onSubmit(); };
    return <Popover open modal={false} onOpenChange={open => { if (!open) onClose(); }}>
        <PopoverAnchor virtualRef={anchor} />
        <PopoverContent side="bottom" align="start" sideOffset={6} collisionPadding={12}
            aria-label={draft.id ? '编辑评论' : '添加评论'} data-canvas-comment-editor="true"
            className="w-[300px] max-w-[calc(100vw-24px)] rounded-xl border-foreground/50 bg-card p-2.5 shadow-sm"
            onOpenAutoFocus={event => { event.preventDefault(); textareaRef.current?.focus({ preventScroll: true }); }}
            onCloseAutoFocus={event => event.preventDefault()}
            onEscapeKeyDown={event => {
                if (composingRef.current) { event.preventDefault(); return; }
                event.preventDefault(); onExitMode();
            }}
            onPointerDown={event => event.stopPropagation()} onMouseDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>
            <form onSubmit={event => { event.preventDefault(); submit(); }}>
                <Textarea ref={textareaRef} rows={1} aria-label="评论内容" placeholder="输入你的评论…" maxLength={200}
                    value={draft.text} onChange={event => onChange(event.target.value)}
                    className="min-h-8 resize-none rounded-none border-0 p-0 text-sm shadow-none focus-visible:ring-0"
                    onCompositionStart={() => { composingRef.current = true; }} onCompositionEnd={() => { composingRef.current = false; }}
                    onKeyDown={event => {
                        event.stopPropagation();
                        if (event.key === 'Escape' && !event.nativeEvent.isComposing && !composingRef.current) {
                            event.preventDefault(); onExitMode(); return;
                        }
                        if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && !composingRef.current && event.keyCode !== 229) {
                            event.preventDefault(); submit();
                        }
                    }} />
                <div className="flex h-7 items-center justify-end gap-2">
                    {draft.id && <Button type="button" variant="ghost" size="icon" className="mr-auto h-7 w-7 rounded-full text-muted-foreground" aria-label="删除评论" onClick={onDelete}><Trash2 size={14} /></Button>}
                    <span className="text-xs tabular-nums text-muted-foreground" aria-label="评论字数">{draft.text.length}/200</span>
                    <Button type="submit" variant="default" size="icon" className="h-7 w-7 rounded-full" disabled={!canSubmit} aria-label={draft.id ? '保存评论 (Enter)' : '发送评论 (Enter)'}><ArrowUp size={16} /></Button>
                </div>
            </form>
        </PopoverContent>
    </Popover>;
}
