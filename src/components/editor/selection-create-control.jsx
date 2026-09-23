import React from 'react';
import { Plus, Group, Save, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { getNodeBounds } from '@/lib/canvas-viewport';
import { connectNodeSources } from '@/lib/node-io';
import { CONTENT_NODES, AUXILIARY_NODES, DERIVED_NODES } from '@/lib/node-catalog';
import { useOverlaysSuspended } from '@/components/ui/overlay-suspension';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';

export function SelectionCreateControl({ nodes, zoom, onCreate, onGroup, onSave, onDownload }) {
    const suspended = useOverlaysSuspended();
    const bounds = getNodeBounds(nodes);
    if (!bounds || suspended) return null;
    const padding = 12 / zoom;
    return <>
        <div data-canvas-selection-bounds className="canvas-selection-box pointer-events-none absolute rounded-xl"
            style={{ left: bounds.left - padding, top: bounds.top - padding, width: bounds.right - bounds.left + padding * 2, height: bounds.bottom - bounds.top + padding * 2, borderWidth: 1 / zoom }} />
        <div className="absolute z-40" style={{ left: (bounds.left + bounds.right) / 2, top: bounds.top - 36 / zoom, transform: `translate(-50%, -100%) scale(${1 / zoom})`, transformOrigin: 'bottom center' }}
            onMouseDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>
            <TooltipProvider delayDuration={350}>
                <div role="toolbar" aria-label={`已选 ${nodes.length} 个节点`} className="flex items-center gap-1 rounded-full border border-border bg-popover p-1 text-popover-foreground">
                    {[[onGroup, Group, '分组'], [onSave, Save, '保存为模板'], [onDownload, Download, '下载选中素材']].filter(([action]) => action).map(([action, Icon, label]) =>
                        <Tooltip key={label}><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" aria-label={label} onClick={action}><Icon size={16} /></Button></TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>
                    )}
                </div>
            </TooltipProvider>
        </div>
        <div className="absolute z-40" style={{ left: bounds.right + 20 / zoom, top: (bounds.top + bounds.bottom) / 2, transform: `scale(${1 / zoom}) translateY(-50%)`, transformOrigin: 'left top' }} onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
        <DropdownMenu modal={false}><DropdownMenuTrigger asChild><Button variant="secondary" size="icon" className="rounded-full border border-border" aria-label="从选中节点创建下游"><Plus size={18} /></Button></DropdownMenuTrigger>
            <DropdownMenuContent><DropdownMenuLabel>{nodes.length} 个来源 → 新节点</DropdownMenuLabel><DropdownMenuSeparator />
                {[...CONTENT_NODES, ...AUXILIARY_NODES, ...DERIVED_NODES].map(([type, label]) => <DropdownMenuItem key={type} disabled={Boolean(connectNodeSources([], nodes, { type }).error)} onSelect={() => onCreate(type)}>{label}</DropdownMenuItem>)}
            </DropdownMenuContent>
        </DropdownMenu>
        </div>
    </>;
}
