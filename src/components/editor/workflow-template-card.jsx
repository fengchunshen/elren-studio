import React, { useState } from 'react';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { EditorDialog } from './editor-dialog';
import { collectCanvasAssets, nodeTitle } from '@/lib/workspace-library';
import { getNodeBounds } from '@/lib/canvas-viewport';

export function WorkflowDiagram({ workflow }) {
    const nodes = (workflow.nodes || []).filter(node => Number.isFinite(node.x) && Number.isFinite(node.y));
    const bounds = getNodeBounds(nodes);
    if (!bounds) return null;
    const width = bounds.right - bounds.left + 120;
    const height = bounds.bottom - bounds.top + 120;
    const labelSize = Math.max(24, width / 28);
    const byId = new Map(nodes.map(node => [node.id, node]));
    return <svg role="img" aria-label={`${workflow.name}的节点与连线`} viewBox={`${bounds.left - 60} ${bounds.top - 60} ${width} ${height}`} className="h-full w-full p-3">
        {(workflow.connections || []).map((connection, index) => {
            const from = byId.get(connection.from);
            const to = byId.get(connection.to);
            if (!from || !to) return null;
            const x1 = from.x + (from.width || 320), y1 = from.y + (from.height || 240) / 2;
            const x2 = to.x, y2 = to.y + (to.height || 240) / 2;
            const bend = Math.max(60, Math.abs(x2 - x1) / 2);
            return <path key={index} d={`M${x1},${y1} C${x1 + bend},${y1} ${x2 - bend},${y2} ${x2},${y2}`} fill="none" className="stroke-muted-foreground/50" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />;
        })}
        {nodes.map(node => <g key={node.id}>
            <rect x={node.x} y={node.y} width={node.width || 320} height={node.height || 240} rx="18" className="fill-muted stroke-border" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            <text x={node.x + 20} y={node.y + 24 + labelSize} fontSize={labelSize} className="fill-foreground">{nodeTitle(node).slice(0, Math.max(1, Math.floor(((node.width || 320) - 40) / labelSize)))}</text>
            <path d={`M${node.x + 20},${node.y + 50 + labelSize} h${(node.width || 320) - 40}`} className="stroke-border" vectorEffect="non-scaling-stroke" />
        </g>)}
    </svg>;
}

function WorkflowCover({ workflow }) {
    const [failed, setFailed] = useState(false);
    const media = workflow.cover
        ? { type: 'image', url: workflow.cover }
        : collectCanvasAssets(workflow.nodes || [], []).sort((a, b) => Number(b.type === 'image') - Number(a.type === 'image'))[0];
    if (!media || failed) return <WorkflowDiagram workflow={workflow} />;
    if (workflow.coverFrames?.length) return <div className="grid h-full grid-rows-3 gap-0.5" aria-label={`${workflow.name}封面`}>
        {workflow.coverFrames.slice(0, 3).map((url, index) => <img key={index} src={url} alt="" className="h-full min-h-0 w-full object-cover" loading="lazy" onError={() => setFailed(true)} />)}
    </div>;
    return media.type === 'video'
        ? <video src={media.url} className="h-full w-full object-contain" muted playsInline preload="metadata" onError={() => setFailed(true)} />
        : <img src={media.url} alt={`${workflow.name}封面`} className={`h-full w-full ${workflow.coverFit === 'cover' ? 'object-cover' : 'object-contain'}`} loading="lazy" onError={() => setFailed(true)} />;
}

export function WorkflowTemplateCard({ workflow, onPreview, onApply, onRename, onRemove }) {
    return <article className="min-w-0" data-template-card={workflow.id}>
        <div className="group/cover relative aspect-square overflow-hidden rounded-xl bg-muted" data-template-cover>
            <WorkflowCover workflow={workflow} />
            <div data-template-actions className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 bg-black/45 opacity-0 transition-opacity group-hover/cover:pointer-events-auto group-hover/cover:opacity-100 group-focus-within/cover:pointer-events-auto group-focus-within/cover:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100">
                <Button variant="ghost" className="h-9 rounded-lg px-3 text-sm text-white hover:bg-white/15 hover:text-white" aria-label={`查看模板：${workflow.name}`} onClick={() => onPreview(workflow)}>查看</Button>
                <Button variant="ghost" className="h-9 rounded-lg px-3 text-sm text-white hover:bg-white/15 hover:text-white" aria-label={`应用模板：${workflow.name}`} onClick={() => onApply(workflow)}>应用</Button>
            </div>
        </div>
        <div className="mt-2 flex items-start gap-1" data-template-caption>
            <p className="min-w-0 flex-1 text-[13px] leading-5 text-muted-foreground" title={workflow.name}>{workflow.name}</p>
            {!workflow.builtin && <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-5 w-5 shrink-0" aria-label={`管理模板：${workflow.name}`}><MoreHorizontal size={14} /></Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => onRename(workflow)}><Pencil size={14} />重命名</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => onRemove(workflow.id)}><Trash2 size={14} />移除模板</DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>}
        </div>
    </article>;
}

export function WorkflowTemplatePreview({ workflow, onClose, onApply }) {
    return <EditorDialog isOpen={!!workflow} onClose={onClose} title={workflow?.name || '模板预览'} className="w-[960px]" bodyClassName="p-5">
        {workflow && <>
            <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
                <div className="aspect-square overflow-hidden rounded-xl bg-muted"><WorkflowCover key={workflow.id} workflow={workflow} /></div>
                <div className="flex min-w-0 flex-col gap-4">
                    {workflow.description && <p className="text-sm leading-6 text-muted-foreground">{workflow.description}</p>}
                    <div className="min-h-48 flex-1 overflow-hidden rounded-xl border border-border bg-card"><WorkflowDiagram workflow={workflow} /></div>
                    <p className="text-xs text-muted-foreground">{workflow.nodes.length} 个节点 · {workflow.connections?.length || 0} 条连线</p>
                </div>
            </div>
            <div className="mt-5 flex justify-end"><Button onClick={() => onApply(workflow)}>应用到画布</Button></div>
        </>}
    </EditorDialog>;
}
