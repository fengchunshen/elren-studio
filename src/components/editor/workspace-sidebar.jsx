import { CONTENT_NODES, AUXILIARY_NODES, EXTENSION_NODES, ADVANCED_NODES } from '@/lib/node-catalog';
import { SubjectLibrary } from './subject-library';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Search, AudioLines, FolderOpen, LayoutTemplate, MessageCircle, History, MoreHorizontal, X, Image, Video, FileText, Wrench, Upload, Star, ArrowUpRight, Save, Download, Layers, Bot, Users, Settings, Maximize2, Minimize2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent } from '@/components/ui/dropdown-menu';
import { BUILTIN_WORKFLOWS, NODE_NAMES, collectCanvasAssets, filterCanvasNodes, nodeCategory, nodeSearchText, nodeTitle, readLibraryMediaFile } from '@/lib/workspace-library';
import { libraryScope, listLibraryEntries, saveLibraryEntry, removeLibraryEntry } from '@/services/workspaceLibrary';
import { sanitizeImportedProject } from '@/services/projectStorage';
import { migrateLegacyValue } from '@/services/legacyStorage';
import { WorkflowTemplateCard, WorkflowTemplatePreview } from './workflow-template-card';

const PANEL_NAMES = { create: '新增', search: '节点搜索', assets: '素材库', templates: '工作流模板', notes: '评论模式', history: '生成历史' };
const FOLDERS = ['角色', '场景', '道具', '风格', '其他'];
const icons = { model: Layers, audio: AudioLines, text: FileText, image: Image, video: Video, tool: Wrench };

function PanelHeader({ title, onClose, children }) {
    return <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
        <h2 className="min-w-0 flex-1 text-sm font-semibold">{title}</h2>{children}
        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full" aria-label="关闭侧栏面板" onClick={onClose}><X size={15} /></Button>
    </div>;
}
function Filters({ items, value, onChange }) {
    return <div className="flex flex-wrap gap-1">{items.map(([key, label]) => <Button key={key} variant={value === key ? 'secondary' : 'ghost'} size="sm" className="h-7 rounded-full px-2.5 text-xs" aria-pressed={value === key} onClick={() => onChange(key)}>{label}</Button>)}</div>;
}
function Empty({ title, description }) {
    return <div className="px-5 py-10 text-center"><p className="text-sm text-foreground">{title}</p><p className="mt-2 text-xs leading-relaxed text-muted-foreground">{description}</p></div>;
}
function CreatePanel({ onAddNode, onUpload }) {
    const sections = [['内容', CONTENT_NODES], ['独立工具', AUXILIARY_NODES], ['扩展创作', EXTENSION_NODES]]
        .map(([label, items]) => [label, items.map(([type, name]) => [type, type.includes('video') ? Video : type.includes('image') ? Image : type.includes('audio') ? AudioLines : type.includes('model') || type === 'three-studio' ? Layers : FileText, name])]);
    return <ScrollArea><div className="p-2">{sections.map(([title, items]) => <section key={title} className="mb-2">
        <h3 className="px-3 pb-1 pt-3 text-[11px] text-muted-foreground">{title}</h3>
        {items.map(([type, Icon, name, description]) => <Button key={type} variant="ghost" className="h-auto w-full justify-start rounded-xl px-3 py-2.5" onClick={() => onAddNode(type)}>
            <Icon size={18} className="text-muted-foreground" /><span className="flex-1 text-left"><span className="block text-sm">{name}</span>{description && <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">{description}</span>}</span><Plus size={14} className="text-muted-foreground" />
        </Button>)}
    </section>)}<div className="border-t border-border pt-2"><Button variant="ghost" className="w-full justify-start rounded-xl" onClick={onUpload}><Upload size={17} />上传图片 / 视频 / 音频 / 3D</Button></div></div></ScrollArea>;
}
function SearchPanel({ nodes, onLocate }) {
    const [query, setQuery] = useState('');
    const [category, setCategory] = useState('all');
    const results = useMemo(() => filterCanvasNodes(nodes, query, category), [nodes, query, category]);
    return <>
        <div className="space-y-3 border-b border-border p-3">
            <Input autoFocus aria-label="搜索画布节点" placeholder="搜索标题、提示词或正文" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && results[0]) onLocate(results[0]); }} />
            <Filters value={category} onChange={setCategory} items={[[ 'all', '全部'], ['image', '图片'], ['video', '视频'], ['audio', '音频'], ['model', '3D'], ['text', '文本'], ['tool', '工具']]} />
        </div>
        <ScrollArea><div className="p-2">
            <p className="px-2 py-1 text-[11px] text-muted-foreground">{results.length} 个节点 · 点击定位</p>
            {results.map(node => { const Icon = icons[nodeCategory(node)]; return <Button key={node.id} variant="ghost" className="h-auto w-full justify-start rounded-xl p-3" onClick={() => onLocate(node)}>
                <Icon size={17} className="shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1 text-left"><span className="block truncate text-sm">{nodeTitle(node)}</span><span className="mt-1 line-clamp-2 whitespace-normal text-xs font-normal text-muted-foreground">{nodeSearchText(node).split('\n').slice(1).join(' ') || '暂无文本内容'}</span></span><ArrowUpRight size={14} className="shrink-0 text-muted-foreground" />
            </Button>; })}
            {!results.length && <Empty title={nodes.length ? '没有找到节点' : '画布还是空的'} description={nodes.length ? '试试其他关键词或节点类型。' : '点击左侧「＋」创建第一个节点。'} />}
        </div></ScrollArea>
    </>;
}

function HistoryPanel({ history, nodes, onInsert, onPreview, onDownload, onLocate, onManage }) {
    const [query, setQuery] = useState('');
    const [type, setType] = useState('all');
    const filtered = history.filter(item => (type === 'all' || item.type === type) && `${item.prompt || ''} ${item.modelName || ''}`.toLowerCase().includes(query.toLowerCase()));
    return <>
        <div className="space-y-3 border-b border-border p-3"><Input aria-label="搜索生成历史" placeholder="搜索提示词或模型名称" value={query} onChange={event => setQuery(event.target.value)} />
            <div className="flex items-center justify-between gap-2"><Filters value={type} onChange={setType} items={[[ 'all', '全部'], ['image', '图片'], ['video', '视频']]} /><Button variant="ghost" size="sm" onClick={onManage}>批量与队列</Button></div>
        </div>
        <ScrollArea><div className="p-3">
            <p className="mb-3 text-[11px] text-muted-foreground">{filtered.length} 条生成记录</p>
            {filtered.map(item => {
                const urls = [...new Set([...(item.mjImages || []), ...(item.output_images || []), item.url].filter(Boolean))];
                const source = nodes.find(node => node.id === item.sourceNodeId);
                const generating = item.status === 'generating';
                const statusLabel = generating ? '生成中' : ['failed', 'error'].includes(item.status) ? '失败' : item.status === 'canceled' ? '已取消' : ['completed', 'succeeded', 'partially_succeeded'].includes(item.status) ? '已完成' : '待处理';
                return <article key={item.id} className="mb-3 overflow-hidden rounded-xl border border-border bg-card p-2.5">
                    <div className="mb-2 flex justify-between gap-2 text-[11px]"><span className="truncate">{item.modelName || (item.type === 'video' ? '视频生成' : '图片生成')}</span><span className="shrink-0 text-muted-foreground">{statusLabel}</span></div>
                    {item.type === 'audio' && urls[0] && <audio controls src={urls[0]} className="mb-2 w-full" />}
                    {urls.length > 0 && <div className={urls.length > 1 ? 'grid grid-cols-2 gap-1.5' : ''}>{urls.map((url, index) => <div key={url} className="relative overflow-hidden rounded-lg">
                        <Button variant="ghost" className="h-auto w-full overflow-hidden rounded-lg p-0" aria-label={`预览生成结果 ${index + 1}`} onClick={() => onPreview(item, url, index)}>
                            {item.type === 'audio' ? <AudioLines size={32} className="m-6 text-muted-foreground" /> : item.type === 'video' ? <video src={url} className="aspect-video w-full object-cover" muted preload="metadata" /> : <img src={url} alt={item.prompt || '生成结果'} className="aspect-video w-full object-cover" loading="lazy" />}
                        </Button><Button variant="secondary" size="icon" className="absolute bottom-1 right-1 h-6 w-6 rounded-full" aria-label={`将生成结果 ${index + 1} 放入画布`} onClick={() => onInsert({ url, type: item.type === 'audio' ? 'audio' : item.type === 'video' ? 'video' : 'image', name: item.prompt || item.modelName })}><Plus size={12} /></Button>
                    </div>)}</div>}
                    {generating && <div className="my-3 h-1 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary/50" style={{ width: `${Math.max(0, Math.min(100, Number(item.progress) || 0))}%` }} /></div>}
                    <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-muted-foreground">{item.prompt || '暂无提示词'}</p>
                    {item.errorMsg && <p className="mt-2 text-xs text-destructive">{item.errorMsg}</p>}
                    <div className="mt-2 flex items-center justify-between gap-1"><span className="text-[10px] text-muted-foreground">{item.time || ''}</span><div className="flex gap-1"><Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" disabled={!source} onClick={() => onLocate(source)}>定位节点</Button><Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" disabled={!urls.length} onClick={() => onDownload(item)}><Download size={12} />下载</Button></div></div>
                </article>;
            })}
            {!filtered.length && <Empty title={history.length ? '没有找到记录' : '还没有生成记录'} description={history.length ? '试试其他关键词或媒体类型。' : '生成的图片和视频会保留在这里，可预览、下载或再次放入画布。'} />}
        </div></ScrollArea>
    </>;
}

function AssetsPanel({ request, nodes, history, entries, onSave, onRemove, onInsert, normalizeAsset, onAddNode }) {
    const [source, setSource] = useState('canvas');
    const [query, setQuery] = useState('');
    const [folder, setFolder] = useState('all');
    const [favorites, setFavorites] = useState(false);
    const [busy, setBusy] = useState(false);
    const fileRef = useRef(null);
    useEffect(() => { if (request?.id) { setSource('saved'); setQuery(''); setFolder('all'); setFavorites(false); } }, [request?.id]);
    const canvasAssets = useMemo(() => collectCanvasAssets(nodes, history), [nodes, history]);
    const savedAssets = entries.filter(entry => entry.kind === 'asset');
    const assets = (source === 'canvas' ? canvasAssets : savedAssets).filter(asset => (!query || asset.name.toLowerCase().includes(query.toLowerCase()))
        && (folder === 'all' || (asset.folder || '其他') === folder) && (!favorites || asset.favorite));
    const saveAsset = async asset => {
        setBusy(true);
        try {
            const saved = savedAssets.find(item => asset.type === 'text' ? item.type === 'text' && item.text === asset.text : item.url === asset.url);
            await onSave({ ...(saved || asset), id: saved?.id || (asset.kind === 'asset' ? asset.id : undefined), kind: 'asset', folder: asset.folder || '其他', favorite: !asset.favorite, ...(asset.type === 'text' ? { text: asset.text } : { url: await normalizeAsset(asset.url) }) });
            if (source === 'canvas') { setSource('saved'); toast.success('已收藏到我的素材'); }
        } catch (error) { toast.error(error.message); } finally { setBusy(false); }
    };
    return <>
        <div className="space-y-3 border-b border-border p-3">
            <div className="flex items-center justify-between gap-2"><Filters value={source} onChange={value => { setSource(value); setFolder('all'); setFavorites(false); }} items={[[ 'canvas', '当前项目'], ['saved', '我的素材'], ['subjects', '主体库'], ['characters', '我的角色']]} /><Button size="sm" variant="secondary" disabled={busy} onClick={() => fileRef.current?.click()}><Upload size={14} />上传</Button></div>
            <Input aria-label="搜索素材" placeholder="搜索素材名称" value={query} onChange={event => setQuery(event.target.value)} />
            {source === 'saved' && <div className="flex gap-2"><NativeSelect aria-label="素材文件夹" value={folder} onChange={event => setFolder(event.target.value)} className="h-8 flex-1 text-xs"><option value="all">全部文件夹</option>{FOLDERS.map(name => <option key={name}>{name}</option>)}</NativeSelect><Button variant={favorites ? 'secondary' : 'ghost'} size="sm" aria-pressed={favorites} onClick={() => setFavorites(!favorites)}><Star size={14} />收藏</Button></div>}
            <input ref={fileRef} type="file" multiple accept="image/*,video/*,audio/*,.glb" className="hidden" aria-label="上传到素材库" onChange={async event => {
                const files = Array.from(event.target.files || []); event.target.value = ''; setBusy(true);
                try {
                    for (const file of files) {
                        await onSave(await readLibraryMediaFile(file, folder === 'all' ? '其他' : folder));
                    }
                    setSource('saved'); setFavorites(false);
                } catch (error) { toast.error(error.message || '上传失败'); } finally { setBusy(false); }
            }} />
        </div>
        {['subjects', 'characters'].includes(source) ? <ScrollArea><SubjectLibrary key={source} charactersOnly={source === 'characters'} onCreateCharacter={() => onAddNode('create-character')} normalizeAsset={normalizeAsset} entries={entries} nodes={nodes} history={history} onSave={onSave} onInsert={onInsert} /></ScrollArea> : <ScrollArea><div className="p-3">
            <p className="mb-3 text-[11px] text-muted-foreground">点击或拖入画布使用{source === 'saved' ? ' · 个人库保存在此浏览器' : ''}</p>
            <div className="grid grid-cols-2 gap-3">{assets.map(asset => <div key={asset.id} className="min-w-0 rounded-xl border border-border bg-card p-1.5" draggable onDragStart={event => { event.dataTransfer.setData('application/x-elren-library-asset', JSON.stringify(asset)); event.dataTransfer.effectAllowed = 'copy'; }}>
                <Button variant="ghost" className="relative h-auto w-full overflow-hidden rounded-lg p-0" aria-label={`放入画布：${asset.name}`} onClick={() => onInsert(asset)}>
                    {asset.type === 'text' ? <span className="line-clamp-5 h-28 w-full whitespace-pre-wrap p-3 text-left text-xs font-normal">{asset.text}</span> : asset.type === 'model' ? <Layers size={32} className="m-6 text-muted-foreground" /> : asset.type === 'audio' ? <AudioLines size={32} className="m-6 text-muted-foreground" /> : asset.type === 'video' ? <video src={asset.url} className="aspect-[4/3] w-full object-cover" muted preload="metadata" /> : <img src={asset.url} alt={asset.name} className="aspect-[4/3] w-full object-cover" loading="lazy" />}
                    <span className="absolute bottom-1 right-1 rounded bg-background/80 p-1"><Plus size={12} /></span>
                </Button>
                {asset.type === 'audio' && <audio src={asset.url} controls className="mt-2 w-full" />}
                <div className="flex items-center gap-1 px-1 pt-1"><span className="min-w-0 flex-1 truncate text-[11px]" title={asset.name}>{asset.name}</span><Button variant="ghost" size="icon" className="h-6 w-6" disabled={busy} aria-label={asset.favorite ? '取消收藏素材' : '收藏素材'} onClick={() => saveAsset(asset)}><Star size={12} fill={asset.favorite ? 'currentColor' : 'none'} /></Button>
                    {source === 'saved' && <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-6 w-6" aria-label={`管理素材：${asset.name}`}><MoreHorizontal size={13} /></Button></DropdownMenuTrigger><DropdownMenuContent>
                        {FOLDERS.map(name => <DropdownMenuItem key={name} onSelect={() => onSave({ ...asset, folder: name }).catch(error => toast.error(error.message))}>移到{name}</DropdownMenuItem>)}
                        <DropdownMenuSeparator /><DropdownMenuItem onSelect={() => onRemove(asset.id).catch(error => toast.error(error.message))}>移出素材库</DropdownMenuItem>
                    </DropdownMenuContent></DropdownMenu>}
                </div>
            </div>)}</div>
            {!assets.length && <Empty title="暂无素材" description={source === 'canvas' ? '上传素材或生成图片、视频后，会在这里显示。' : '上传素材，或从当前项目收藏素材，方便以后复用。'} />}
        </div></ScrollArea>}
    </>;
}

function TemplatesPanel({ entries, onSave, onRemove, onCapture, onInsert, selectedCount, expanded, onToggleExpanded, onClose, loadError, request }) {
    const [source, setSource] = useState('builtin');
    const [query, setQuery] = useState('');
    const [name, setName] = useState('');
    const [editing, setEditing] = useState(null);
    const [saveOpen, setSaveOpen] = useState(false);
    const [preview, setPreview] = useState(null);
    const [cover, setCover] = useState('');
    const coverRef = useRef(null);
    const [busy, setBusy] = useState(false);
    const inputRef = useRef(null);
    const nameRef = useRef(null);
    const focusSaveRef = useRef(false);
    useEffect(() => {
        if (!request) return;
        setSource('saved'); setQuery(''); setEditing(null); setName(request.name || ''); setCover(''); setSaveOpen(true);
    }, [request]);
    const workflows = (source === 'builtin' ? BUILTIN_WORKFLOWS : entries.filter(entry => entry.kind === 'workflow')).filter(entry => `${entry.name} ${entry.description || ''}`.toLowerCase().includes(query.toLowerCase()));
    return <>
        <div className="flex shrink-0 items-center gap-3 border-b border-border px-4">
            <div className="flex min-w-0 flex-1 items-center gap-4" aria-label="模板来源">
                {[[ 'builtin', '公共模板'], ['saved', '我的模板']].map(([key, label]) => <Button key={key} variant="ghost" aria-pressed={source === key}
                    className={`h-12 rounded-none border-b-2 px-0 text-sm hover:bg-transparent ${source === key ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground'}`}
                    onClick={() => setSource(key)}>{label}</Button>)}
            </div>
            <DropdownMenu modal={false}><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8" aria-label="模板更多操作"><MoreHorizontal size={17} /></Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end" onCloseAutoFocus={event => { if (focusSaveRef.current) { event.preventDefault(); nameRef.current?.focus(); focusSaveRef.current = false; } }}>
                    <DropdownMenuItem onSelect={() => inputRef.current?.click()}><Upload size={14} />导入模板</DropdownMenuItem>
                    <DropdownMenuItem disabled={!selectedCount} onSelect={() => { setEditing(null); setName(''); setCover(''); setSource('saved'); setSaveOpen(true); focusSaveRef.current = true; }}><Save size={14} />保存选中节点为模板（{selectedCount}）</DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={expanded ? '收起模板库' : '展开模板库'} title={expanded ? '收起模板库' : '展开模板库'} onClick={onToggleExpanded}>
                {expanded ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="关闭模板库" onClick={onClose}><X size={17} /></Button>
        </div>
        <div className="shrink-0 px-4 pb-3 pt-4">
            <div className="relative"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input aria-label="搜索模板" placeholder="搜索工作流模板…" className="rounded-xl pl-9" value={query} onChange={event => setQuery(event.target.value)} /></div>
            {loadError && <p role="alert" className="mt-2 text-xs text-destructive">{loadError}</p>}
            <input ref={inputRef} type="file" accept=".json" className="hidden" aria-label="导入模板文件" onChange={async event => { const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; try {
                const data = sanitizeImportedProject(migrateLegacyValue(JSON.parse(await file.text())));
                if (data.type !== 'workflow' || !data.nodes?.length || data.nodes.some(node => !NODE_NAMES[node.type])) throw new Error('请选择有效的工作流 JSON 文件');
                await onSave({ kind: 'workflow', name: data.name || file.name.replace(/\.json$/i, ''), nodes: data.nodes, connections: data.connections || [] }); setSource('saved');
            } catch (error) { toast.error(error.message); } }} />
        </div>
        {saveOpen && <form className="shrink-0 space-y-2 border-b border-border p-4" aria-label="保存模板" onSubmit={async event => { event.preventDefault(); if (!name.trim()) return; setBusy(true); try {
            const snapshot = editing || await onCapture();
            await onSave({ ...snapshot, ...(cover ? { cover } : {}), kind: 'workflow', name: name.trim() }); setName(''); setCover(''); setEditing(null); setSaveOpen(false); setQuery(''); setSource('saved'); toast.success('模板已保存');
        } catch (error) { toast.error(error.message); } finally { setBusy(false); } }}>
            <div className="flex items-center justify-between"><Label htmlFor="sidebar-template-name" className="text-xs">{editing ? '重命名模板' : `保存选中的 ${selectedCount} 个节点`}</Label><Button type="button" variant="ghost" size="icon" className="h-6 w-6" aria-label="取消保存模板" onClick={() => { setSaveOpen(false); setEditing(null); }}><X size={13} /></Button></div>
            <div className="flex gap-2"><Input ref={nameRef} autoFocus id="sidebar-template-name" placeholder="模板名称" value={name} onChange={event => setName(event.target.value)} /><Button type="submit" size="sm" disabled={busy || !name.trim() || (!editing && !selectedCount)}>保存</Button></div>
            <div className="flex items-center gap-3">{cover && <img src={cover} alt="模板封面预览" className="h-10 w-14 rounded object-cover" />}<Button type="button" variant="ghost" size="sm" onClick={() => coverRef.current?.click()}><Image size={14} />{cover ? '更换封面' : '选择封面'}</Button></div>
            <input ref={coverRef} type="file" accept="image/*" className="hidden" aria-label="选择模板封面文件" onChange={async event => { const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; try { const asset = await readLibraryMediaFile(file); if (asset.type !== 'image') throw new Error('请选择图片'); setCover(asset.url); } catch (error) { toast.error(error.message); } }} />
        </form>}
        <ScrollArea className="flex-1" data-template-gallery="true"><div className="px-4 pb-4">
            <div className={`grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 ${expanded ? 'xl:grid-cols-4' : ''}`}>
                {workflows.map(workflow => <WorkflowTemplateCard key={workflow.id} workflow={workflow} onPreview={setPreview} onApply={onInsert}
                    onRename={item => { setEditing(item); setName(item.name); setCover(item.cover || ''); setSaveOpen(true); }}
                    onRemove={id => onRemove(id).catch(error => toast.error(error.message))} />)}
            </div>
            {!workflows.length && !saveOpen && <Empty title={query ? '没有找到模板' : '暂无模板'} description={query ? '试试其他名称或关键词。' : '选中节点后，从右上角菜单保存。'} />}
        </div></ScrollArea>
        <WorkflowTemplatePreview workflow={preview} onClose={() => setPreview(null)} onApply={workflow => { setPreview(null); onInsert(workflow); }} />
    </>;
}

export function WorkspaceSidebar({ assetRequest, panel, onPanelChange, nodes, history, historyContent, charactersContent, selectedCount, templateRequest,
    onAddNode, onUploadCanvas, onLocateNode, onInsertAsset, normalizeAsset, onCaptureWorkflow, onInsertWorkflow,
    onSaveProject, onLoadProject, onImportWorkflow, onArrange, onSettings,
    onPreviewHistory, onDownloadHistory, showCharacterLibrary = true, showAdvanced = true, accountSlot = null }) {
    const { t } = useTranslation();
    const [entries, setEntries] = useState([]);
    const [templatesExpanded, setTemplatesExpanded] = useState(false);
    useEffect(() => { if (panel !== 'templates') setTemplatesExpanded(false); }, [panel]);
    const [owner] = useState(libraryScope);
    const [loadError, setLoadError] = useState('');
    useEffect(() => {
        let canceled = false;
        if (!['assets', 'templates'].includes(panel)) return;
        listLibraryEntries(owner).then(items => { if (!canceled) { setEntries(items); setLoadError(''); } }).catch(error => { if (!canceled) setLoadError(error.message); });
        return () => { canceled = true; };
    }, [panel, owner, assetRequest?.id]);
    const save = async value => { const result = await saveLibraryEntry(value, owner); setEntries(previous => [result, ...previous.filter(entry => entry.id !== result.id)]); return result; };
    const remove = async id => { await removeLibraryEntry(id, owner); setEntries(previous => previous.filter(entry => entry.id !== id)); };
    const close = () => onPanelChange(null);
    const content = key => {
        if (key === 'templates') return <TemplatesPanel entries={entries} onSave={save} onRemove={remove} selectedCount={selectedCount} onCapture={onCaptureWorkflow} onInsert={onInsertWorkflow}
            expanded={templatesExpanded} onToggleExpanded={() => setTemplatesExpanded(previous => !previous)} onClose={close} loadError={loadError} request={templateRequest} />;
        if (key === 'history' && panel === 'history-tools') return <><PanelHeader title="生成记录管理" onClose={close}><Button variant="ghost" size="sm" onClick={() => onPanelChange('history')}>返回</Button></PanelHeader>{historyContent}</>;
        return <><PanelHeader title={t(PANEL_NAMES[key])} onClose={close} />
            {loadError && ['assets', 'templates'].includes(key) && <p role="alert" className="p-3 text-xs text-destructive">{loadError}</p>}
            {key === 'create' && <CreatePanel onAddNode={onAddNode} onUpload={onUploadCanvas} />}
            {key === 'search' && <SearchPanel nodes={nodes} onLocate={onLocateNode} />}
            {key === 'history' && <HistoryPanel history={history} nodes={nodes} onInsert={onInsertAsset} onPreview={onPreviewHistory} onDownload={onDownloadHistory} onLocate={onLocateNode} onManage={() => onPanelChange('history-tools')} />}
            {key === 'assets' && <AssetsPanel request={assetRequest} onAddNode={onAddNode} nodes={nodes} history={history} entries={entries} onSave={save} onRemove={remove} onInsert={onInsertAsset} normalizeAsset={normalizeAsset} />}
        </>;
    };
    return <TooltipProvider delayDuration={250}>
        <nav aria-label="工作台侧栏" className="workspace-sidebar absolute left-4 top-[calc(50%_-_1.5rem)] z-40 flex -translate-y-1/2 flex-col items-center gap-1 rounded-full border border-border bg-popover/95 p-1.5 shadow-lg backdrop-blur-md">
            {[['create', Plus], ['search', Search], ['assets', FolderOpen], ['templates', LayoutTemplate], ['notes', MessageCircle], ['history', History]].map(([key, Icon]) => {
                if (key === 'notes') {
                    const label = panel === 'notes' ? '关闭评论模式' : '打开评论模式';
                    return <Tooltip key={key}><TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="canvas-comment-toggle h-9 w-9 rounded-xl" data-active={panel === 'notes'}
                            aria-label={label} aria-pressed={panel === 'notes'}
                            onClick={() => onPanelChange(previous => previous === 'notes' ? null : 'notes')}><MessageCircle size={19} /></Button>
                    </TooltipTrigger><TooltipContent side="right">{label}</TooltipContent></Tooltip>;
                }
                return (
                <Popover key={key} open={panel === key || (key === 'history' && panel === 'history-tools')} onOpenChange={open => onPanelChange(previous => open ? key : (previous === key || (key === 'history' && previous === 'history-tools')) ? null : previous)}>
                    <Tooltip><TooltipTrigger asChild><PopoverTrigger asChild><Button variant={key === 'create' ? 'default' : (panel === key || (key === 'history' && panel === 'history-tools')) ? 'secondary' : 'ghost'} size="icon" className={key === 'create' ? 'mb-1 h-10 w-10 rounded-full' : 'h-9 w-9 rounded-full'} aria-label={t(PANEL_NAMES[key])} aria-pressed={panel === key || (key === 'history' && panel === 'history-tools')}><Icon size={19} /></Button></PopoverTrigger></TooltipTrigger><TooltipContent side="right">{t(PANEL_NAMES[key])}{key === 'search' ? ' · Ctrl/⌘ + F' : ''}</TooltipContent></Tooltip>
                    <PopoverContent side="right" align="center" sideOffset={12} className={`flex max-w-[calc(100vw-6rem)] flex-col overflow-hidden p-0 ${key === 'templates'
                            ? templatesExpanded ? 'h-[min(820px,calc(100vh-5rem))] w-[1040px]' : 'h-[min(680px,calc(100vh-5rem))] w-[560px]'
                            : 'max-h-[min(640px,var(--radix-popover-content-available-height))] w-[352px]'}`} aria-label={t(PANEL_NAMES[key])}
                        onOpenAutoFocus={event => { if (key !== 'search') event.preventDefault(); }}>
                        {content(key)}
                    </PopoverContent>
                </Popover>
                );
            })}
            <div className="my-1 h-px w-5 bg-border" />
            <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" aria-label="更多工作台操作"><MoreHorizontal size={19} /></Button></DropdownMenuTrigger>
                <DropdownMenuContent side="right" align="end" className="w-52">
                    <DropdownMenuItem onSelect={() => onPanelChange(panel === 'chat' ? null : 'chat')}><Bot size={15} />AI 对话</DropdownMenuItem>
                    {showCharacterLibrary && <DropdownMenuItem onSelect={() => onPanelChange(panel === 'characters' ? null : 'characters')}><Users size={15} />Sora 角色库</DropdownMenuItem>}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={onSaveProject}><Save size={15} />保存项目</DropdownMenuItem>
                    <DropdownMenuItem onSelect={onLoadProject}><FolderOpen size={15} />加载项目</DropdownMenuItem>
                    <DropdownMenuItem onSelect={onImportWorkflow}><Download size={15} />导入工作流到画布</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem disabled={!nodes.length} onSelect={onArrange}><Layers size={15} />自动整理节点</DropdownMenuItem>
                    {showAdvanced && <DropdownMenuSub><DropdownMenuSubTrigger>高级集成</DropdownMenuSubTrigger><DropdownMenuSubContent>{ADVANCED_NODES.map(([type, label]) => <DropdownMenuItem key={type} onSelect={() => onAddNode(type)}>{label}</DropdownMenuItem>)}</DropdownMenuSubContent></DropdownMenuSub>}
                    {onSettings && <DropdownMenuItem onSelect={onSettings}><Settings size={15} />模型设置</DropdownMenuItem>}
                </DropdownMenuContent>
            </DropdownMenu>
            {accountSlot}
        </nav>
        {panel === 'characters' && <div className="absolute bottom-4 left-20 top-4 z-40 flex w-80 overflow-hidden rounded-2xl border border-border bg-popover shadow-xl">{charactersContent}</div>}
    </TooltipProvider>;
}
