import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

// Native Select keeps native onChange, FormData, option values and optgroups.
const NativeSelect = React.forwardRef(({ className, wrapperClassName, children, ...props }, ref) => (
    <div data-slot="native-select-wrapper" className={cn('relative w-fit has-[:disabled]:opacity-50', wrapperClassName)}>
        <select ref={ref} data-slot="native-select" className={cn('h-9 w-full min-w-0 appearance-none rounded-md border border-input bg-background py-1 pl-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed', className, 'pr-8')} {...props}>{children}</select>
        <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
    </div>
));
NativeSelect.displayName = 'NativeSelect';
export { NativeSelect };
