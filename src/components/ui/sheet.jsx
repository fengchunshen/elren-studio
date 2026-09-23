import * as React from 'react';
import * as SheetPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DialogOverlay } from '@/components/ui/dialog';

const Sheet = SheetPrimitive.Root;
const SheetTrigger = SheetPrimitive.Trigger;
const SheetClose = SheetPrimitive.Close;
const SheetTitle = SheetPrimitive.Title;
const SheetDescription = SheetPrimitive.Description;
const SheetContent = React.forwardRef(({ className, children, ...props }, ref) => (
    <SheetPrimitive.Portal>
        <DialogOverlay />
        <SheetPrimitive.Content ref={ref} data-slot="sheet-content" className={cn('fixed inset-y-0 right-0 z-[10051] h-full w-3/4 border-l border-border bg-background p-6 text-foreground shadow-lg transition ease-in-out data-[state=closed]:duration-300 data-[state=open]:duration-500 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm motion-reduce:animate-none', className)} {...props}>
            {children}
            <SheetPrimitive.Close className="absolute right-4 top-4 rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><X className="h-4 w-4" /><span className="sr-only">关闭面板</span></SheetPrimitive.Close>
        </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
));
SheetContent.displayName = 'SheetContent';
export { Sheet, SheetTrigger, SheetClose, SheetContent, SheetTitle, SheetDescription };
