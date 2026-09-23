import React, { useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

// Business composition stays outside the vendored UI primitives.
// These dialogs are controlled from canvas actions, so there is no Radix Trigger.
export function EditorDialog({ isOpen, onClose, title, children, className, bodyClassName, style }) {
    const returnFocus = useRef(null);
    return <Dialog open={isOpen} onOpenChange={open => { if (!open) onClose(); }}>
        <DialogContent
            aria-describedby={undefined}
            aria-modal="true"
            style={style}
            className={cn('flex max-h-[85vh] w-[680px] max-w-[90vw] flex-col gap-0 overflow-hidden p-0', className)}
            onOpenAutoFocus={() => { returnFocus.current = document.activeElement; }}
            onCloseAutoFocus={event => {
                event.preventDefault();
                if (returnFocus.current?.isConnected) returnFocus.current.focus({ preventScroll: true });
            }}
            onKeyDown={event => event.stopPropagation()}
            onMouseDown={event => event.stopPropagation()}
            onClick={event => event.stopPropagation()}
        >
            <DialogHeader className="shrink-0 border-b p-5 pr-12"><DialogTitle>{title}</DialogTitle></DialogHeader>
            <ScrollArea className="flex-1" viewportClassName="[&>div]:h-full">
                <div className={cn('min-h-full', bodyClassName)}>{children}</div>
            </ScrollArea>
        </DialogContent>
    </Dialog>;
}
