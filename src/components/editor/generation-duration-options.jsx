import React, { useLayoutEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

export function GenerationDurationOptions({ label, value, values, onChange, formatValue }) {
    const root = useRef(null);
    const reveal = (button, smooth) => {
        const viewport = root.current?.querySelector('[data-slot="scroll-area-viewport"]');
        if (!viewport || !button) return;
        const bounds = viewport.getBoundingClientRect(), item = button.getBoundingClientRect();
        const center = item.left + item.width / 2 - bounds.left;
        if (center > bounds.width * 0.7 || center < bounds.width * 0.3) {
            viewport.scrollTo({ left: Math.max(0, viewport.scrollLeft + center - bounds.width / 2),
                behavior: smooth && !window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'auto' });
        }
    };
    useLayoutEffect(() => {
        reveal(root.current?.querySelector('[aria-pressed="true"]'), false);
    }, []);
    return <fieldset className="min-w-0 space-y-2">
        <legend className="px-1 text-xs text-muted-foreground">{label}</legend>
        <ScrollArea ref={root} className="rounded-2xl bg-foreground/[0.06] [&_[data-slot=scroll-area-scrollbar]]:invisible [&_[data-slot=scroll-area-scrollbar]]:pointer-events-none" viewportClassName="overflow-y-hidden">
            <div className="flex w-max gap-1 p-1">
                {values.map(option => <Button key={option} type="button" variant="ghost"
                    aria-label={`${label} ${formatValue(option)}`} aria-pressed={option === value}
                    className={cn('h-9 w-10 shrink-0 rounded-xl px-1 font-normal text-muted-foreground', option === value && 'bg-foreground/10 text-foreground')}
                    onClick={event => { onChange(option); reveal(event.currentTarget, true); }}
                    onKeyDown={event => {
                        const direction = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
                        if (!direction) return;
                        event.preventDefault();
                        const next = direction > 0 ? event.currentTarget.nextElementSibling : event.currentTarget.previousElementSibling;
                        next?.focus({ preventScroll: true });
                        reveal(next, true);
                    }}>{formatValue(option)}</Button>)}
            </div>
            <ScrollBar orientation="horizontal" />
        </ScrollArea>
    </fieldset>;
}
