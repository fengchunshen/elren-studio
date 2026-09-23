import React from 'react';
import { MoreHorizontal, Copy, Pencil, Ungroup, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';

export function CanvasWorkflowGroups({ groups, selectedIds, onDrag, onRename, onCopy, onSave, onDownload, onUngroup }) {
    return groups.map(group => {
        const { left, top, right, bottom } = group.bounds;
        const selected = group.nodes.every(node => selectedIds.has(node.id));
        return <section key={group.id} data-workflow-group={group.id} aria-label={`分组：${group.name}`} className="absolute rounded-2xl border bg-card/30"
            style={{ left: left - 24, top: top - 56, width: right - left + 48, height: bottom - top + 80, borderColor: selected ? 'hsl(var(--canvas-node-selected))' : 'hsl(var(--border))' }}
            onMouseDown={event => { if (event.target === event.currentTarget) onDrag(group, event); }} onContextMenu={event => event.stopPropagation()}>
            <div className="absolute inset-x-3 top-2 flex h-8 items-center gap-2">
                <Button variant="ghost" className="h-8 min-w-0 flex-1 cursor-grab justify-start truncate px-1 text-sm text-muted-foreground hover:bg-transparent active:cursor-grabbing" aria-label={`移动分组：${group.name}`}
                    onMouseDown={event => onDrag(group, event)} onDoubleClick={() => onRename(group)}>{group.name}</Button>
                <DropdownMenu modal={false}><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`管理分组：${group.name}`} onMouseDown={event => event.stopPropagation()}><MoreHorizontal size={16} /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent onCloseAutoFocus={event => event.preventDefault()}>
                        <DropdownMenuItem onSelect={() => onRename(group)}><Pencil size={14} />重命名分组</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => onCopy(group)}><Copy size={14} />复制整组</DropdownMenuItem>
                        {onDownload && <DropdownMenuItem onSelect={() => onDownload(group)}>下载组内素材</DropdownMenuItem>}
                        <DropdownMenuItem onSelect={() => onSave(group)}><Save size={14} />保存到我的模板</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => onUngroup(group)}><Ungroup size={14} />解除分组</DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </section>;
    });
}
