import React, { useLayoutEffect, useState } from 'react';
import { AlignLeft, AudioLines, Box, Image, Plus, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel } from '@/components/ui/dropdown-menu';
import { useOverlaysSuspended } from '@/components/ui/overlay-suspension';
import { NODE_DEFINITIONS } from '@/lib/node-io';
import { generationSurface } from './generation-controls';

const creationTypes = [
    ['text-node', '文本生成', AlignLeft, '脚本、广告词、品牌文案'],
    ['gen-image', '图片生成', Image],
    ['gen-video', '视频生成', Video],
    ['gen-audio', '音频', AudioLines],
    ['gen-model', '3D', Box],
];
const stop = event => event.stopPropagation();
const triggerClass = 'h-7 w-7 shrink-0 rounded-full border-[1.5px] border-muted-foreground/70 bg-background p-0 text-muted-foreground shadow-none hover:border-foreground hover:bg-popover hover:text-foreground';

export function NodeAddControls({ node, connecting, onReference, onCreate, onActivate }) {
    const [open, setOpen] = useState(false);
    const suspended = useOverlaysSuspended();
    const definition = NODE_DEFINITIONS[node.type];
    useLayoutEffect(() => { if (suspended || connecting) setOpen(false); }, [suspended, connecting]);
    if (suspended || connecting || !definition) return null;
    return <>
        {definition.inputs.default && <div data-node-add-control="left" onMouseDown={stop} onMouseUp={stop} onClick={stop}>
            <Button type="button" variant="ghost" size="icon" className={triggerClass} aria-label="添加节点参考" onClick={onReference}><Plus size={20} /></Button>
        </div>}
        {definition.output.length > 0 && <div data-node-add-control="right" data-menu-open={open} onMouseDown={stop} onMouseUp={stop} onClick={stop}>
            <DropdownMenu modal={false} open={open} onOpenChange={value => { setOpen(value); if (value) onActivate?.(); }}>
                <DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" className={triggerClass} aria-label="引用该节点生成"><Plus size={20} /></Button></DropdownMenuTrigger>
                <DropdownMenuContent side="right" align="start" sideOffset={8} collisionPadding={12} aria-label="引用该节点生成"
                    className={`${generationSurface} w-64 max-w-[calc(100vw-24px)] p-2`}
                    onMouseDown={stop} onMouseUp={stop} onClick={stop} onKeyDown={stop}>
                    <DropdownMenuLabel className="px-3 py-2 text-sm">引用该节点生成</DropdownMenuLabel>
                    {creationTypes.map(([type, label, Icon, description]) => <DropdownMenuItem key={type}
                        className="min-h-14 gap-3 rounded-xl p-3" onSelect={() => onCreate(type)}>
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-foreground/5"><Icon size={21} strokeWidth={1.6} /></span>
                        <span className="min-w-0"><span className="block text-sm">{label}</span>{description && <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>}</span>
                    </DropdownMenuItem>)}
                </DropdownMenuContent>
            </DropdownMenu>
        </div>}
    </>;
}
