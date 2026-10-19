import React, { useState } from 'react';
import { ArrowLeft, ChevronDown, LayoutGrid, Plus, Pencil, Download, FolderOpen, Undo2, Redo2, Settings, MoreHorizontal } from 'lucide-react';
import { ElrenMark } from '@/components/brand/elren-brand';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { EditorDialog } from './editor-dialog';

export function WorkspaceHeader({ name, onRename, onWorkspace, onCreate, onTemplates, onExport, onImport, onDownload,
    onUndo, onRedo, canUndo, canRedo, onSettings, settingsLabel, toolbar, saveStatus, rightInset = 0 }) {
    const [rename, setRename] = useState(false), [draft, setDraft] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
    return <>
        <header data-workspace-header style={rightInset ? { right: `min(${rightInset + 24}px, calc(100% - 180px))` } : undefined} className="pointer-events-none absolute inset-x-3 top-4 z-50 flex items-start justify-between gap-2 sm:inset-x-4 sm:gap-3">
            <DropdownMenu modal={false}><DropdownMenuTrigger asChild><Button variant="secondary" className="pointer-events-auto h-11 min-w-0 max-w-[300px] justify-start gap-2.5 rounded-xl border border-border/60 bg-popover px-3 shadow-sm" aria-label={`项目菜单：${name}`}>
                <ElrenMark decorative className="[--elren-mark-size:26px]" /><span aria-hidden="true" className="h-4 w-px shrink-0 bg-border" /><span className="min-w-0 flex-1 truncate text-left text-sm">{name}</span><ChevronDown size={14} className="shrink-0 text-muted-foreground" />
            </Button></DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56" onCloseAutoFocus={event => { if (rename) event.preventDefault(); }}>
                    <DropdownMenuItem onSelect={onWorkspace}><ArrowLeft size={15} />返回工作空间</DropdownMenuItem>
                    <DropdownMenuItem onSelect={onCreate}><Plus size={15} />新建项目</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => { setDraft(name); setError(''); setRename(true); }}><Pencil size={15} />重命名项目</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={onTemplates}><LayoutGrid size={15} />工作流库</DropdownMenuItem>
                    {onSettings && <DropdownMenuItem onSelect={onSettings}><Settings size={15} />{settingsLabel}</DropdownMenuItem>}
                    <DropdownMenuSub>
                        <DropdownMenuSubTrigger><MoreHorizontal size={15} />更多</DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                            <DropdownMenuItem onSelect={onExport}><Download size={15} />导出项目</DropdownMenuItem>
                            <DropdownMenuItem onSelect={onImport}><FolderOpen size={15} />导入项目</DropdownMenuItem>
                            <DropdownMenuItem onSelect={onDownload}><Download size={15} />下载选中素材</DropdownMenuItem>
                        </DropdownMenuSubContent>
                    </DropdownMenuSub>
                </DropdownMenuContent>
            </DropdownMenu>
            <div className="pointer-events-auto flex shrink-0 items-center gap-2">
                {saveStatus && <span role="status" className={`text-xs ${saveStatus === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}>
                    {{ saving: '保存中…', saved: '已保存', error: '保存失败，请保留页面' }[saveStatus]}
                </span>}
                <TooltipProvider><div className="flex rounded-xl border border-border/60 bg-popover p-1 shadow-sm">
                    {[[onUndo, canUndo, Undo2, '撤销 (Ctrl+Z)'], [onRedo, canRedo, Redo2, '重做 (Ctrl+Shift+Z)']].map(([action, enabled, Icon, label]) => <Tooltip key={label}><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8" onClick={action} disabled={!enabled} aria-label={label}><Icon size={16} /></Button></TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>)}
                </div></TooltipProvider>
                {toolbar}
            </div>
        </header>
        <EditorDialog isOpen={rename} onClose={() => setRename(false)} title="重命名项目" className="w-[400px]" bodyClassName="p-5">
            <form className="space-y-4" onSubmit={async event => { event.preventDefault(); setBusy(true); try { await onRename(draft); setRename(false); } catch (error) { setError(error.message); } finally { setBusy(false); } }}>
                <Label htmlFor="workspace-project-name">项目名称</Label><Input id="workspace-project-name" maxLength={200} autoFocus value={draft} onChange={event => setDraft(event.target.value)} />
                {error && <p role="alert" className="text-sm text-destructive">{error}</p>}<Button type="submit" disabled={!draft.trim() || busy}>保存</Button>
            </form>
        </EditorDialog>
    </>;
}
