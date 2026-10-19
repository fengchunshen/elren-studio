import React, { useEffect, useRef, useState } from 'react';
import { Plus, Search, LayoutGrid, List, MoreVertical, ChevronDown, Trash2, X } from 'lucide-react';
import { ElrenBrand } from '@/components/brand/elren-brand';
import { ElrenLoader } from '@/components/brand/elren-loader';
import { useElrenLoading } from '@/components/brand/elren-loading-context';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@/components/ui/dropdown-menu';
import { EditorDialog } from './editor-dialog';
import { WorkflowDiagram } from './workflow-template-card';
import { toast } from 'sonner';
import { listWorkspaceProjects, createWorkspaceProject, renameWorkspaceProject, deleteWorkspaceProjects } from '@/services/workspaceProjects';

const SORTS = { recent: '最近编辑', name: '名称排序' };
const MENU_ITEM = 'rounded-lg px-3 py-2';

function editedLabel(time, now = Date.now()) {
    if (!time) return '尚未编辑';
    const minutes = Math.floor((now - time) / 60000);
    if (minutes < 1) return '刚刚编辑';
    if (minutes < 60) return `编辑于 ${minutes} 分钟前`;
    if (minutes < 1440) return `编辑于 ${Math.floor(minutes / 60)} 小时前`;
    if (minutes < 43200) return `编辑于 ${Math.floor(minutes / 1440)} 天前`;
    return `编辑于 ${new Date(time).toLocaleDateString()}`;
}

function deleteMessage(projects) {
    const names = projects.slice(0, 3).map(project => `「${project.name}」`).join('、');
    if (projects.length === 1) return `${names}的画布内容将被删除，且无法恢复。`;
    return `${names}${projects.length > 3 ? '等' : '这'} ${projects.length} 个项目的画布内容将被删除，且无法恢复。`;
}

function ProjectMenu({ project, onOpen, onEdit, className }) {
    return <DropdownMenu modal={false}><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className={`z-10 h-8 w-8 rounded-lg ${className}`} aria-label={`管理项目：${project.name}`}><MoreVertical size={16} /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44 rounded-xl p-1.5">
            <DropdownMenuItem className={MENU_ITEM} onSelect={() => onOpen(project.id)}>打开</DropdownMenuItem>
            <DropdownMenuItem className={MENU_ITEM} onSelect={() => onEdit('rename', project)}>重命名</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className={MENU_ITEM} onSelect={() => onEdit('copy', project)}>复制项目</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className={`${MENU_ITEM} text-destructive focus:text-destructive`} onSelect={() => onEdit('delete', project)}>删除</DropdownMenuItem>
        </DropdownMenuContent>
    </DropdownMenu>;
}

// 工作空间是登录后的首页：从这里新建、管理并打开项目，画布只是打开某个项目后的编辑页。
export function WorkspaceHome({ onOpen, createOnOpen = false, accountSlot = null }) {
    const [projects, setProjects] = useState([]), [query, setQuery] = useState(''), [layout, setLayout] = useState('grid'), [sort, setSort] = useState('recent');
    const [error, setError] = useState(''), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [edit, setEdit] = useState(null), [name, setName] = useState('');
    const [selected, setSelected] = useState(() => new Set()), anchor = useRef(null);
    const load = () => listWorkspaceProjects().then(setProjects);
    const managedLoading = useElrenLoading(loading, '正在加载项目…');
    useEffect(() => { let active = true; listWorkspaceProjects().then(items => { if (active) setProjects(items); }).catch(error => { if (active) setError(error.message); }).finally(() => { if (active) setLoading(false); });
        if (createOnOpen) { setEdit({ mode: 'create' }); setName('未命名项目'); }
        return () => { active = false; };
    }, [createOnOpen]);
    const start = (mode, project) => { setEdit(mode === 'delete' ? { mode, projects: [].concat(project) } : { mode, project }); setName(mode === 'create' ? '未命名项目' : mode === 'copy' ? `${project.name}（副本）` : project.name); setError(''); };
    const shown = projects.filter(project => project.name.toLowerCase().includes(query.trim().toLowerCase())).sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : b.updatedAt - a.updatedAt);
    const list = layout === 'list', now = Date.now();
    // Selection only acts on visible projects; any selection turns card clicks into toggles until cleared.
    const picked = shown.filter(project => selected.has(project.id)), selecting = picked.length > 0, allPicked = picked.length === shown.length;
    const clearSelection = () => { setSelected(new Set()); anchor.current = null; };
    const select = (project, event) => {
        const from = event?.shiftKey ? shown.findIndex(item => item.id === anchor.current) : -1, to = shown.indexOf(project);
        const ids = from >= 0 ? shown.slice(Math.min(from, to), Math.max(from, to) + 1).map(item => item.id) : [project.id];
        const on = from >= 0 || !selected.has(project.id);
        setSelected(previous => { const next = new Set(previous); ids.forEach(id => on ? next.add(id) : next.delete(id)); return next; });
        anchor.current = project.id;
    };
    useEffect(() => {
        if (!selecting || edit) return undefined;
        const onKeyDown = event => { if (event.key === 'Escape' && !event.defaultPrevented) clearSelection(); };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [selecting, edit]);
    // Keep the closing dialog's content stable while its exit animation plays.
    const lastEdit = useRef(null); if (edit) lastEdit.current = edit; const dialog = edit || lastEdit.current;
    return <>
        <div data-workspace-page className="flex h-screen flex-col bg-background text-foreground">
            <header className="flex h-16 shrink-0 items-center justify-between gap-2 px-4 sm:grid sm:h-20 sm:grid-cols-[1fr_auto_1fr] sm:px-8">
                <ElrenBrand compact className="justify-self-start" />
                <h1 className="inline-flex h-10 items-center gap-2 rounded-full bg-secondary px-4 text-sm font-medium text-secondary-foreground"><LayoutGrid size={17} aria-hidden="true" />工作空间</h1>
                <div className="flex min-w-10 items-center justify-self-end gap-2">{accountSlot}</div>
            </header>
            <ScrollArea className="flex-1"><main className={`px-4 pt-6 sm:px-10 sm:pt-8 ${selecting ? 'pb-28' : 'pb-10'}`}>
                <div className="mb-6 flex flex-wrap items-center justify-between gap-4"><h2 className="relative pb-2 text-lg font-medium after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-foreground">我的项目</h2><div className="flex flex-wrap items-center gap-2">
                    <div className="relative"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={event => { setQuery(event.target.value); clearSelection(); }} placeholder="搜索" aria-label="搜索项目" className="h-10 w-44 rounded-xl border-border bg-card pl-9 shadow-none sm:w-56" /></div>
                    <DropdownMenu modal={false}><DropdownMenuTrigger asChild><Button variant="ghost" className="h-10 rounded-xl border border-border bg-card px-3 font-normal" aria-label={`项目排序：${SORTS[sort]}`}>{SORTS[sort]}<ChevronDown size={15} className="text-muted-foreground" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-36 rounded-xl p-1.5"><DropdownMenuRadioGroup value={sort} onValueChange={setSort}>{Object.entries(SORTS).map(([key, label]) => <DropdownMenuRadioItem key={key} value={key} className="rounded-lg py-2 pl-3">{label}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>
                    <div className="flex h-10 items-center gap-0.5 rounded-xl border border-border bg-card p-1">{[['grid', LayoutGrid, '网格视图'], ['list', List, '列表视图']].map(([key, Icon, label]) => <Button key={key} size="icon" variant={layout === key ? 'secondary' : 'ghost'} className="h-8 w-8 rounded-lg shadow-none" aria-label={label} aria-pressed={layout === key} onClick={() => setLayout(key)}><Icon size={17} /></Button>)}</div>
                    <Button variant="secondary" onClick={() => start('create')} className="h-10 rounded-xl px-4 shadow-none"><Plus size={17} />新建项目</Button>
                </div></div>
                {error && <p role="alert" className="mb-4 text-sm text-destructive">{error}</p>}
                {loading ? !managedLoading && <ElrenLoader label="正在加载项目…" className="py-16" /> : <div className={list ? 'flex flex-col gap-3' : 'grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'}>
                    {!list && !query && <Button variant="ghost" className="h-auto min-h-48 flex-col gap-3 rounded-2xl border border-border bg-card text-foreground hover:bg-accent/60" onClick={() => start('create')}><span className="flex h-11 w-11 items-center justify-center rounded-full bg-foreground text-background"><Plus size={22} /></span>新建项目</Button>}
                    {shown.map(project => { const checked = selected.has(project.id); return <article key={project.id} data-workspace-project={project.id} className={`group relative rounded-2xl border bg-card ${checked ? 'border-foreground/60' : 'border-border'} ${list ? 'flex items-center gap-4 p-2 pr-3' : 'p-2.5'}`}>
                        <div className={`relative shrink-0 overflow-hidden rounded-xl ${project.previewNodes?.length ? 'bg-background' : 'bg-muted'} ${list ? 'h-20 w-28' : 'aspect-[4/3]'}`}>
                            {project.previewNodes?.length ? <div className="absolute inset-0"><WorkflowDiagram workflow={{ name: project.name, nodes: project.previewNodes, connections: project.previewConnections || [] }} /></div> : <span className={`absolute inset-0 flex items-center justify-center text-muted-foreground ${list ? 'text-xs' : 'text-sm'}`}>空白画布</span>}
                            {project.cover && <img src={project.cover} alt="" className="absolute inset-0 h-full w-full object-cover" onError={event => { event.currentTarget.hidden = true; }} />}
                            <span className="absolute inset-0 bg-black/10 opacity-0 transition-opacity group-hover:opacity-100" />
                        </div>
                        <Checkbox checked={checked} onClick={event => select(project, event)} aria-label={`选择项目：${project.name}`} className={`absolute z-10 h-5 w-5 rounded-md border-foreground/50 bg-background/80 shadow-none after:absolute after:-inset-1.5 data-[state=checked]:border-primary ${list ? 'left-[14px] top-[14px]' : 'left-6 top-6'} ${selecting ? '' : 'opacity-0 focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100'}`} />
                        <div className={`min-w-0 flex-1 ${list ? '' : 'px-1 pb-0.5 pt-3'}`}>
                            <h3 className="flex min-w-0"><Button variant="ghost" className="h-auto max-w-full justify-start rounded-none p-0 text-sm font-semibold after:absolute after:inset-0 after:rounded-2xl hover:bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:after:ring-2 focus-visible:after:ring-ring" aria-label={`${selecting ? '切换选择' : '打开项目'}：${project.name}`} tabIndex={selecting ? -1 : undefined} onClick={event => selecting || event.shiftKey || event.metaKey || event.ctrlKey ? select(project, event) : onOpen(project.id)}><span className="truncate">{project.name}</span></Button></h3>
                            <p className="mt-1 truncate text-xs text-muted-foreground">{editedLabel(project.updatedAt, now)}</p>
                        </div>
                        <ProjectMenu project={project} onOpen={onOpen} onEdit={start} className={`${list ? 'relative' : 'absolute right-[18px] top-[18px] bg-background/80 opacity-0 hover:bg-background focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100'} ${selecting ? 'invisible' : ''}`} />
                    </article>; })}
                </div>}
                {!loading && !shown.length && (query ? <p className="py-20 text-center text-muted-foreground">没有找到项目</p> : list && <p className="py-20 text-center text-muted-foreground">暂无项目</p>)}
            </main></ScrollArea>
            {selecting && <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
                <div role="toolbar" aria-label="已选项目操作" className="pointer-events-auto flex max-w-full items-center gap-1 rounded-2xl border border-border bg-popover p-1.5 pl-4 text-popover-foreground shadow-md animate-in fade-in-0 slide-in-from-bottom-2 motion-reduce:animate-none">
                    <span className="mr-2 whitespace-nowrap text-sm">已选择 {picked.length} 个项目</span>
                    <Button variant="ghost" className="h-9 rounded-xl px-3 font-normal" onClick={() => allPicked ? clearSelection() : setSelected(new Set(shown.map(project => project.id)))}>{allPicked ? '取消全选' : '全选'}</Button>
                    <Button variant="ghost" className="h-9 rounded-xl px-3 font-normal text-destructive hover:text-destructive" onClick={() => start('delete', picked)}><Trash2 size={16} />删除</Button>
                    <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl" aria-label="取消选择" onClick={clearSelection}><X size={17} /></Button>
                </div>
            </div>}
        </div>
        <EditorDialog isOpen={!!edit} onClose={() => setEdit(null)} title={dialog?.projects?.length > 1 ? `删除 ${dialog.projects.length} 个项目` : { rename: '重命名项目', copy: '复制项目', delete: '删除项目' }[dialog?.mode] || '新建项目'} className="w-[420px]" bodyClassName="p-5">
            <form className="space-y-4" onSubmit={async event => { event.preventDefault(); setBusy(true); setError(''); try {
                if (edit.mode === 'delete') {
                    const { deleted, failed } = await deleteWorkspaceProjects(edit.projects), gone = new Set(deleted.map(project => project.id));
                    setProjects(previous => previous.filter(item => !gone.has(item.id)));
                    setSelected(previous => new Set([...previous].filter(id => !gone.has(id))));
                    if (deleted.length) toast.success(deleted.length === 1 ? `已删除「${deleted[0].name}」` : `已删除 ${deleted.length} 个项目`);
                    // Keep the dialog on the projects that failed so they can be retried or left alone.
                    if (failed.length) { setEdit({ mode: 'delete', projects: failed.map(item => item.project) }); setError(`${failed.length === 1 ? `「${failed[0].project.name}」` : `${failed.length} 个项目`}删除失败：${failed[0].error.message}`); }
                    else setEdit(null);
                }
                else if (edit.mode === 'rename') { await renameWorkspaceProject(edit.project, name); await load(); setEdit(null); }
                else { const project = await createWorkspaceProject(name, edit.mode === 'copy' ? edit.project.id : undefined); setEdit(null); onOpen(project.id); }
            } catch (error) { setError(error.message); } finally { setBusy(false); } }}>
                {dialog?.mode === 'delete' ? <p className="text-sm">{deleteMessage(dialog.projects)}</p> : <><Label htmlFor="project-library-name">项目名称</Label><Input id="project-library-name" autoFocus maxLength={200} value={name} onChange={event => setName(event.target.value)} /></>}
                {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
                {dialog?.mode === 'delete' ? <div className="flex justify-end gap-2"><Button type="button" variant="ghost" autoFocus onClick={() => setEdit(null)}>取消</Button><Button type="submit" variant="destructive" disabled={busy}>{busy ? '删除中…' : '删除'}</Button></div>
                    : <div className="flex justify-end"><Button type="submit" disabled={busy || !name.trim()}>{busy ? '保存中…' : dialog?.mode === 'rename' ? '保存' : '创建并打开'}</Button></div>}
            </form>
        </EditorDialog>
    </>;
}
