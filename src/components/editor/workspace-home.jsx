import React, { useEffect, useState } from 'react';
import { Plus, Search, LayoutGrid, List, MoreHorizontal, Pencil, Copy, ArrowLeft } from 'lucide-react';
import { ElrenBrand } from '@/components/brand/elren-brand';
import { ElrenLoader } from '@/components/brand/elren-loader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { NativeSelect } from '@/components/ui/native-select';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { EditorDialog } from './editor-dialog';
import { WorkflowDiagram } from './workflow-template-card';
import { listWorkspaceProjects, createWorkspaceProject, renameWorkspaceProject } from '@/services/workspaceProjects';

export function WorkspaceHome({ open, currentId, onClose, onOpen, onRenamed, createOnOpen = false, accountSlot = null }) {
    const [projects, setProjects] = useState([]), [query, setQuery] = useState(''), [layout, setLayout] = useState('grid'), [sort, setSort] = useState('recent');
    const [error, setError] = useState(''), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [edit, setEdit] = useState(null), [name, setName] = useState('');
    const load = () => listWorkspaceProjects().then(setProjects);
    useEffect(() => { if (!open) return; let active = true; setLoading(true); setError(''); listWorkspaceProjects().then(items => { if (active) setProjects(items); }).catch(error => { if (active) setError(error.message); }).finally(() => { if (active) setLoading(false); });
        if (createOnOpen) { setEdit({ mode: 'create' }); setName('未命名项目'); }
        return () => { active = false; };
    }, [open, createOnOpen]);
    const start = (mode, project) => { setEdit({ mode, project }); setName(mode === 'create' ? '未命名项目' : mode === 'copy' ? `${project.name}（副本）` : project.name); setError(''); };
    const shown = projects.filter(project => project.name.toLowerCase().includes(query.trim().toLowerCase())).sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : b.updatedAt - a.updatedAt);
    return <>
        <Dialog open={open} onOpenChange={value => { if (!value) onClose(); }}><DialogContent showCloseButton={false} aria-describedby={undefined} onKeyDown={event => event.stopPropagation()}
            className="inset-0 flex h-screen w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 bg-background p-0">
            <header className="flex h-20 shrink-0 items-center justify-between gap-3 px-4 sm:px-10"><ElrenBrand compact /><DialogTitle className="text-sm sm:text-base">工作空间</DialogTitle><div className="flex shrink-0 items-center gap-2"><Button variant="ghost" className="px-2 sm:px-4" aria-label="返回画布" onClick={onClose}><ArrowLeft size={16} /><span className="hidden sm:inline">返回画布</span></Button>{accountSlot}</div></header>
            <ScrollArea className="flex-1"><main className="px-6 pb-10 pt-8 sm:px-10">
                <div className="mb-6 flex flex-wrap items-center justify-between gap-4"><h2 className="border-b-2 border-foreground pb-2 text-lg font-medium">我的项目</h2><div className="flex flex-wrap items-center gap-2">
                    <div className="relative"><Search size={16} className="absolute left-3 top-3 text-muted-foreground" /><Input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索项目" aria-label="搜索项目" className="w-48 rounded-xl pl-9" /></div>
                    <NativeSelect aria-label="项目排序" value={sort} onChange={event => setSort(event.target.value)}><option value="recent">最近编辑</option><option value="name">名称排序</option></NativeSelect>
                    <div className="flex rounded-xl border border-border p-1">{[['grid', LayoutGrid, '网格视图'], ['list', List, '列表视图']].map(([key, Icon, label]) => <Button key={key} size="icon" variant={layout === key ? 'secondary' : 'ghost'} className="h-8 w-8" aria-label={label} aria-pressed={layout === key} onClick={() => setLayout(key)}><Icon size={17} /></Button>)}</div>
                    <Button onClick={() => start('create')} className="rounded-xl"><Plus size={17} />新建项目</Button>
                </div></div>
                {error && <p role="alert" className="mb-4 text-sm text-destructive">{error}</p>}
                {loading ? <ElrenLoader label="正在加载项目…" className="py-16" /> : <div className={layout === 'grid' ? 'grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5' : 'flex flex-col gap-3'}>
                    {layout === 'grid' && !query && <Button variant="ghost" className="h-auto min-h-64 flex-col gap-4 rounded-2xl border border-border bg-card text-foreground" onClick={() => start('create')}><span className="rounded-full bg-foreground p-3 text-background"><Plus size={22} /></span>新建项目</Button>}
                    {shown.map(project => <article key={project.id} data-workspace-project={project.id} className={`rounded-2xl border border-border bg-card p-2 ${layout === 'list' ? 'flex items-center gap-4' : ''}`}>
                        <Button variant="ghost" className={`group relative overflow-hidden rounded-xl p-0 ${project.previewNodes?.length ? 'bg-background hover:bg-background' : 'bg-muted'} ${layout === 'list' ? 'h-20 w-28 shrink-0' : 'aspect-[4/3] h-auto w-full'}`} aria-label={`打开项目：${project.name}`} onClick={() => onOpen(project.id)}>
                            {project.previewNodes?.length ? <WorkflowDiagram workflow={{ name: project.name, nodes: project.previewNodes, connections: project.previewConnections || [] }} /> : <span className="text-sm text-muted-foreground">空白画布</span>}
                            {project.cover && <img src={project.cover} alt="" className="absolute inset-0 h-full w-full object-cover" onError={event => { event.currentTarget.hidden = true; }} />}
                            <span className="absolute inset-0 bg-black/10 opacity-0 transition-opacity group-hover:opacity-100" />
                        </Button>
                        <div className={`flex min-w-0 flex-1 items-start gap-2 px-1 py-3 ${layout === 'grid' ? '' : 'pr-3'}`}><div className="min-w-0 flex-1"><Button variant="link" className="h-auto max-w-full justify-start p-0 text-left text-sm text-foreground" onClick={() => onOpen(project.id)}><span className="truncate">{project.name}</span></Button><p className="mt-1 text-xs text-muted-foreground">{project.id === currentId ? '当前项目 · ' : ''}{project.updatedAt ? new Date(project.updatedAt).toLocaleDateString() : '尚未编辑'}</p></div>
                            <DropdownMenu modal={false}><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`管理项目：${project.name}`}><MoreHorizontal size={16} /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => start('rename', project)}><Pencil size={14} />重命名</DropdownMenuItem><DropdownMenuItem onSelect={() => start('copy', project)}><Copy size={14} />复制项目</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
                        </div>
                    </article>)}
                </div>}
                {!loading && query && !shown.length && <p className="py-20 text-center text-muted-foreground">没有找到项目</p>}
            </main></ScrollArea>
        </DialogContent></Dialog>
        <EditorDialog isOpen={!!edit} onClose={() => setEdit(null)} title={edit?.mode === 'rename' ? '重命名项目' : edit?.mode === 'copy' ? '复制项目' : '新建项目'} className="w-[420px]" bodyClassName="p-5">
            <form className="space-y-4" onSubmit={async event => { event.preventDefault(); setBusy(true); setError(''); try {
                if (edit.mode === 'rename') { const saved = await renameWorkspaceProject(edit.project, name); onRenamed(edit.project.id, saved); await load(); setEdit(null); }
                else { const project = await createWorkspaceProject(name, edit.mode === 'copy' ? edit.project.id : undefined); setEdit(null); onOpen(project.id); }
            } catch (error) { setError(error.message); } finally { setBusy(false); } }}><Label htmlFor="project-library-name">项目名称</Label><Input id="project-library-name" autoFocus maxLength={200} value={name} onChange={event => setName(event.target.value)} />
                {error && <p role="alert" className="text-sm text-destructive">{error}</p>}<div className="flex justify-end"><Button type="submit" disabled={busy || !name.trim()}>{busy ? '保存中…' : edit?.mode === 'rename' ? '保存' : '创建并打开'}</Button></div>
            </form>
        </EditorDialog>
    </>;
}
