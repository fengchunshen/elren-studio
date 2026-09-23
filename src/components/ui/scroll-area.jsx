import * as React from 'react';
import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area';
import { cn } from '@/lib/utils';

// shadcn/ui Scroll Area, adapted for React 18 and flex-constrained panels.
const ScrollArea = React.forwardRef(({ className, children, viewportClassName, type = 'hover', scrollHideDelay = 150, ...props }, ref) => (
    <ScrollAreaPrimitive.Root
        ref={ref}
        data-slot="scroll-area"
        type={type}
        scrollHideDelay={scrollHideDelay}
        className={cn('relative grid min-h-0 min-w-0 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)] overflow-hidden', className)}
        {...props}
    >
        <ScrollAreaPrimitive.Viewport
            data-slot="scroll-area-viewport"
            tabIndex={0}
            className={cn('min-h-0 w-full rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&>div]:!block', viewportClassName)}
        >
            {children}
        </ScrollAreaPrimitive.Viewport>
        <ScrollBar />
        <ScrollAreaPrimitive.Corner className="bg-transparent" />
    </ScrollAreaPrimitive.Root>
));
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName;

const ScrollBar = React.forwardRef(({ className, orientation = 'vertical', ...props }, ref) => (
    <ScrollAreaPrimitive.ScrollAreaScrollbar
        ref={ref}
        data-slot="scroll-area-scrollbar"
        orientation={orientation}
        className={cn('flex touch-none select-none bg-transparent p-[2px]',
            orientation === 'vertical' ? 'h-full w-2.5' : 'h-2.5 flex-col', className)}
        {...props}
    >
        <ScrollAreaPrimitive.ScrollAreaThumb
            data-slot="scroll-area-thumb"
            className="relative flex-1 rounded-full bg-[hsl(var(--scrollbar-thumb))] transition-colors hover:bg-[hsl(var(--scrollbar-thumb-hover))] active:bg-[hsl(var(--scrollbar-thumb-hover))] motion-reduce:transition-none"
        />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
));
ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName;

export { ScrollArea, ScrollBar };
