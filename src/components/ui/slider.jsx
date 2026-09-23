import * as React from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { cn } from '@/lib/utils';

const Slider = React.forwardRef(({ className, 'aria-label': ariaLabel, thumbLabels, ...props }, ref) => (
    <SliderPrimitive.Root ref={ref} data-slot="slider" className={cn('relative flex w-full touch-none select-none items-center', className)} {...props}>
        <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-primary/20"><SliderPrimitive.Range className="absolute h-full bg-primary" /></SliderPrimitive.Track>
        {Array.from({ length: (props.value || props.defaultValue || [0]).length }, (_, index) => <SliderPrimitive.Thumb key={index} aria-label={thumbLabels?.[index] || ((props.value || props.defaultValue || [0]).length > 1 ? `${ariaLabel} ${index + 1}` : ariaLabel)} className="block h-4 w-4 rounded-full border border-primary/50 bg-background shadow transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50" />)}
    </SliderPrimitive.Root>
));
Slider.displayName = 'Slider';
export { Slider };
