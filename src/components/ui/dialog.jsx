import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;
const DialogOverlay = React.forwardRef(({ className, ...props }, ref) => (
    <DialogPrimitive.Overlay ref={ref} data-slot="dialog-overlay" className={cn('fixed inset-0 z-[10050] bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 motion-reduce:animate-none', className)} {...props} />
));
DialogOverlay.displayName = 'DialogOverlay';
const DialogContent = React.forwardRef(({ className, children, showCloseButton = true, ...props }, ref) => (
    <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content ref={ref} data-slot="dialog-content" className={cn('fixed left-1/2 top-1/2 z-[10051] grid w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border border-border bg-background p-6 text-foreground shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 motion-reduce:animate-none', className)} {...props}>
            {children}
            {showCloseButton && <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm text-muted-foreground transition-opacity hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none"><X className="h-4 w-4" /><span className="sr-only">关闭</span></DialogPrimitive.Close>}
        </DialogPrimitive.Content>
    </DialogPortal>
));
DialogContent.displayName = 'DialogContent';
function DialogHeader({ className, ...props }) { return <div className={cn('flex flex-col space-y-1.5 text-center sm:text-left', className)} {...props} />; }
function DialogFooter({ className, ...props }) { return <div className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2', className)} {...props} />; }
const DialogTitle = React.forwardRef(({ className, ...props }, ref) => <DialogPrimitive.Title ref={ref} className={cn('text-lg font-semibold leading-none tracking-tight', className)} {...props} />);
DialogTitle.displayName = 'DialogTitle';
const DialogDescription = React.forwardRef(({ className, ...props }, ref) => <DialogPrimitive.Description ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />);
DialogDescription.displayName = 'DialogDescription';
export { Dialog, DialogTrigger, DialogPortal, DialogClose, DialogOverlay, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription };
