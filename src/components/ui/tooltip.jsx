import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '@/lib/utils';
const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;
const TooltipContent = React.forwardRef(({ className, sideOffset = 8, ...props }, ref) => (
    <TooltipPrimitive.Portal><TooltipPrimitive.Content ref={ref} sideOffset={sideOffset} data-slot="tooltip-content"
        className={cn('z-[10070] rounded-lg border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md', className)} {...props} /></TooltipPrimitive.Portal>
));
TooltipContent.displayName = 'TooltipContent';
export { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent };
