import * as React from 'react';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOverlayState, useOverlaysSuspended } from './overlay-suspension';

const DropdownMenu = ({ open, defaultOpen, onOpenChange, ...props }) => <DropdownMenuPrimitive.Root {...props} {...useOverlayState({ open, defaultOpen, onOpenChange })} />;
const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
const DropdownMenuContent = React.forwardRef(({ className, sideOffset = 4, onCloseAutoFocus, ...props }, ref) => {
    const suspended = useOverlaysSuspended();
    return <DropdownMenuPrimitive.Portal><DropdownMenuPrimitive.Content ref={ref} data-slot="dropdown-menu-content" sideOffset={sideOffset}
        onCloseAutoFocus={event => { if (suspended) event.preventDefault(); else onCloseAutoFocus?.(event); }}
        className={cn('z-[10060] min-w-[8rem] overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 motion-reduce:animate-none', className, suspended && 'invisible pointer-events-none')} {...props} /></DropdownMenuPrimitive.Portal>;
});
DropdownMenuContent.displayName = 'DropdownMenuContent';
const DropdownMenuItem = React.forwardRef(({ className, ...props }, ref) => (
    <DropdownMenuPrimitive.Item ref={ref} data-slot="dropdown-menu-item" className={cn('relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50', className)} {...props} />
));
DropdownMenuItem.displayName = 'DropdownMenuItem';
const DropdownMenuLabel = React.forwardRef(({ className, ...props }, ref) => <DropdownMenuPrimitive.Label ref={ref} className={cn('px-2 py-1.5 text-xs font-medium text-muted-foreground', className)} {...props} />);
DropdownMenuLabel.displayName = 'DropdownMenuLabel';
const DropdownMenuSeparator = React.forwardRef(({ className, ...props }, ref) => <DropdownMenuPrimitive.Separator ref={ref} className={cn('-mx-1 my-1 h-px bg-muted', className)} {...props} />);
DropdownMenuSeparator.displayName = 'DropdownMenuSeparator';
const DropdownMenuSub = DropdownMenuPrimitive.Sub;
const DropdownMenuSubTrigger = React.forwardRef(({ className, children, ...props }, ref) => (
    <DropdownMenuPrimitive.SubTrigger ref={ref} className={cn('flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent data-[state=open]:bg-accent data-[disabled]:opacity-50', className)} {...props}>
        {children}<ChevronRight className="ml-auto h-4 w-4" aria-hidden="true" />
    </DropdownMenuPrimitive.SubTrigger>
));
DropdownMenuSubTrigger.displayName = 'DropdownMenuSubTrigger';
const DropdownMenuSubContent = React.forwardRef(({ className, sideOffset = 4, ...props }, ref) => (
    <DropdownMenuPrimitive.Portal><DropdownMenuPrimitive.SubContent ref={ref} sideOffset={sideOffset} collisionPadding={8} className={cn('z-[10060] min-w-40 max-h-[var(--radix-popper-available-height)] overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md outline-none', className)} {...props} /></DropdownMenuPrimitive.Portal>
));
DropdownMenuSubContent.displayName = 'DropdownMenuSubContent';
export { DropdownMenuLabel, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent };
