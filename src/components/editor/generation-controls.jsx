import React from 'react';
import { GenerationDurationOptions } from './generation-duration-options';
import { Check, ChevronDown, Scan } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { PopoverContent } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { NodeInspector } from './node-frame';

export function GenerationPanel({ children, label }) {
    return <NodeInspector label={label} preferredWidth={640} className="generation-inspector rounded-[22px] border-border/60 bg-popover/95 p-4 backdrop-blur-xl">{children}</NodeInspector>;
}

export { GenerationModelPicker } from './generation-model-picker';

// Editor compositions share a surface; Radix owns focus, dismissal and collision handling.
export const generationSurface = 'generation-floating-surface rounded-[22px] border-border/60 bg-muted/95 shadow-lg backdrop-blur-xl';
const stop = event => event.stopPropagation();

export function GenerationPopover({ className, ...props }) {
    return <PopoverContent side="top" align="start" sideOffset={10} collisionPadding={12}
        className={cn(generationSurface, 'max-h-[min(440px,var(--radix-popover-content-available-height))] w-80 max-w-[calc(100vw-24px)] overflow-y-auto p-3', className)}
        onMouseDown={stop} onMouseUp={stop} onClick={stop} onDoubleClick={stop} onWheel={stop} onKeyDown={stop} {...props} />;
}

export function GenerationChoice({ label, value, options, onChange, children, className, disabled = false }) {
    return <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild><Button type="button" variant="ghost" disabled={disabled} aria-label={label}
            className={cn('h-9 min-w-0 gap-1.5 rounded-xl px-2 text-sm data-[state=open]:bg-muted', className)}>
            {children || <span className="truncate">{options.find(option => String(option.value) === String(value))?.label || value}</span>}
            <ChevronDown size={12} className="shrink-0 text-muted-foreground" />
        </Button></DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" sideOffset={10} collisionPadding={12} aria-label={label}
            className={cn(generationSurface, 'max-h-[min(360px,var(--radix-dropdown-menu-content-available-height))] max-w-[calc(100vw-24px)] overflow-y-auto p-1.5')}
            onMouseDown={stop} onMouseUp={stop} onClick={stop} onDoubleClick={stop} onWheel={stop} onKeyDown={stop}>
            {options.map(option => <DropdownMenuItem key={option.value} role="menuitemradio" aria-checked={String(option.value) === String(value)}
                className="min-h-9 rounded-xl px-3" onSelect={() => onChange(option.value)}>
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                <Check size={14} className={String(option.value) === String(value) ? '' : 'invisible'} />
            </DropdownMenuItem>)}
        </DropdownMenuContent>
    </DropdownMenu>;
}

export function RatioIcon({ value, className }) {
    if (value === 'auto') return <Scan aria-hidden="true" size={21} className={className} />;
    const [width, height] = String(value).split(':').map(Number);
    const ratio = width > 0 && height > 0 ? width / height : 1;
    return <span aria-hidden="true" className={cn('flex h-6 w-7 shrink-0 items-center justify-center', className)}>
        <span className="rounded-[2px] border-[1.5px] border-current" style={{ width: ratio >= 1 ? 22 : 22 * ratio, height: ratio >= 1 ? 22 / ratio : 22 }} />
    </span>;
}

export function GenerationOptions({ label, value, values, onChange, ratios = false, horizontal = false, formatValue = value => value }) {
    if (horizontal) return <GenerationDurationOptions {...{ label, value, values, onChange, formatValue }} />;
    const adaptive = ratios && values.includes('auto');
    const display = option => option === 'auto' ? '自适应' : formatValue(option);
    return <fieldset className="min-w-0 space-y-2">
        <legend className="px-1 text-xs text-muted-foreground">{label}</legend>
        <div className={cn('grid gap-1 rounded-2xl bg-foreground/[0.06] p-1', ratios ? adaptive ? 'grid-cols-[56px_repeat(5,minmax(0,1fr))] auto-rows-[48px]' : values.length === 6 ? 'grid-cols-6' : 'grid-cols-5' : '')}
            style={!ratios ? { gridTemplateColumns: `repeat(${Math.min(values.length, 4)}, minmax(0, 1fr))` } : undefined}>
            {values.map(option => <Button key={option} type="button" variant="ghost" aria-pressed={option === value}
                aria-label={`${label} ${display(option)}`} onClick={() => onChange(option)}
                className={cn('h-9 min-w-0 rounded-xl px-1 font-normal text-muted-foreground hover:bg-foreground/[0.06]', ratios && 'h-12 flex-col gap-1 text-[11px]', adaptive && option === 'auto' && 'row-span-2 h-14 self-start text-xs', option === value && 'bg-foreground/10 text-foreground hover:bg-foreground/10')}>
                {ratios && <RatioIcon value={option} />}{display(option)}
            </Button>)}
        </div>
    </fieldset>;
}
