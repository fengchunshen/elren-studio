import * as React from 'react';
import * as ContextMenuPrimitive from '@radix-ui/react-context-menu';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

// shadcn/ui Context Menu composition, adapted to the project's React 18 / Tailwind 3 tokens.
const ContextMenu = ContextMenuPrimitive.Root;
const ContextMenuTrigger = ContextMenuPrimitive.Trigger;
const ContextMenuGroup = ContextMenuPrimitive.Group;
const ContextMenuSub = ContextMenuPrimitive.Sub;

const contentClass = 'z-[10060] min-w-40 max-h-[var(--radix-context-menu-content-available-height)] overflow-y-auto rounded-2xl border border-border bg-popover p-1.5 text-popover-foreground shadow-xl outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 motion-reduce:animate-none';
const itemClass = 'relative flex cursor-default select-none items-center gap-3 rounded-xl px-3 py-2.5 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-40';

const ContextMenuContent = React.forwardRef(({ className, collisionPadding = 8, ...props }, ref) => (
    <ContextMenuPrimitive.Portal>
        <ContextMenuPrimitive.Content ref={ref} data-slot="context-menu-content" collisionPadding={collisionPadding} className={cn(contentClass, className)} {...props} />
    </ContextMenuPrimitive.Portal>
));
ContextMenuContent.displayName = 'ContextMenuContent';

const ContextMenuItem = React.forwardRef(({ className, ...props }, ref) => (
    <ContextMenuPrimitive.Item ref={ref} data-slot="context-menu-item" className={cn(itemClass, className)} {...props} />
));
ContextMenuItem.displayName = 'ContextMenuItem';

const ContextMenuSubTrigger = React.forwardRef(({ className, children, ...props }, ref) => (
    <ContextMenuPrimitive.SubTrigger ref={ref} data-slot="context-menu-sub-trigger" className={cn(itemClass, 'data-[state=open]:bg-accent data-[state=open]:text-accent-foreground', className)} {...props}>
        {children}<ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" aria-hidden="true" />
    </ContextMenuPrimitive.SubTrigger>
));
ContextMenuSubTrigger.displayName = 'ContextMenuSubTrigger';

const ContextMenuSubContent = React.forwardRef(({ className, collisionPadding = 8, sideOffset = 4, ...props }, ref) => (
    <ContextMenuPrimitive.Portal>
        <ContextMenuPrimitive.SubContent ref={ref} data-slot="context-menu-sub-content" sideOffset={sideOffset} collisionPadding={collisionPadding} className={cn(contentClass, className)} {...props} />
    </ContextMenuPrimitive.Portal>
));
ContextMenuSubContent.displayName = 'ContextMenuSubContent';

const ContextMenuSeparator = React.forwardRef(({ className, ...props }, ref) => (
    <ContextMenuPrimitive.Separator ref={ref} data-slot="context-menu-separator" className={cn('my-1.5 h-px bg-border', className)} {...props} />
));
ContextMenuSeparator.displayName = 'ContextMenuSeparator';

const ContextMenuLabel = React.forwardRef(({ className, ...props }, ref) => (
    <ContextMenuPrimitive.Label ref={ref} className={cn('px-3 py-2 text-xs font-medium text-muted-foreground', className)} {...props} />
));
ContextMenuLabel.displayName = 'ContextMenuLabel';

function ContextMenuShortcut({ className, ...props }) {
    return <span className={cn('ml-auto pl-4 text-xs tracking-wide text-muted-foreground', className)} {...props} />;
}

export {
    ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuGroup,
    ContextMenuSub, ContextMenuSubTrigger, ContextMenuSubContent, ContextMenuSeparator,
    ContextMenuLabel, ContextMenuShortcut,
};
