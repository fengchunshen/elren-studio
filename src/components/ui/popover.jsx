import * as React from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { cn } from '@/lib/utils';
import { useOverlayState, useOverlaysSuspended } from './overlay-suspension';

const Popover = ({ open, defaultOpen, onOpenChange, ...props }) => <PopoverPrimitive.Root {...props} {...useOverlayState({ open, defaultOpen, onOpenChange })} />;
const PopoverTrigger = PopoverPrimitive.Trigger;
const PopoverAnchor = PopoverPrimitive.Anchor;
const PopoverClose = PopoverPrimitive.Close;
const PopoverContent = React.forwardRef(({ className, align = 'center', sideOffset = 8, collisionPadding = 12, onCloseAutoFocus, ...props }, ref) => {
    const suspended = useOverlaysSuspended();
    return (
    <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content ref={ref} data-slot="popover-content" align={align} sideOffset={sideOffset} collisionPadding={collisionPadding}
            onCloseAutoFocus={event => { if (suspended) event.preventDefault(); else onCloseAutoFocus?.(event); }}
            className={cn('z-[10040] w-80 rounded-2xl border border-border bg-popover p-4 text-popover-foreground shadow-xl outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 motion-reduce:animate-none', className, suspended && 'invisible pointer-events-none')} {...props} />
    </PopoverPrimitive.Portal>
); });
PopoverContent.displayName = 'PopoverContent';
export { Popover, PopoverTrigger, PopoverAnchor, PopoverClose, PopoverContent };
