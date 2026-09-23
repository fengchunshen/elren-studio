import * as React from 'react';
import { cn } from '@/lib/utils';

const Card = React.forwardRef(({ className, ...props }, ref) => <div ref={ref} data-slot="card" className={cn('rounded-xl border border-border bg-card text-card-foreground shadow', className)} {...props} />);
Card.displayName = 'Card';
export { Card };
