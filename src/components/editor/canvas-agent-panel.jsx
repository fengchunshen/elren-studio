import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUp, Check, ChevronDown, FileText, Image as ImageIcon, Loader2, MousePointer2, Plus, Square, Video, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { api } from '@/services/apiClient';
import { notifyTask, watchTask } from '@/services/taskService';
import { captureProjectStorage } from '@/services/projectStorage';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { messageReferencePayload } from '@/lib/canvas-agent';
import AgentMessage from './agent-message';
import AgentOrb from './agent-orb';
import AgentHistory from './agent-history';
import AgentReference from './agent-reference';
import './canvas-agent-panel.css';

const active = status => ['running','waiting_canvas','waiting_approval'].includes(status);
const actionLabel = { read_canvas: '读取画布', read_workflow_library: '读取制作方法', apply_workflow: '搭建工作流', inspect_workflow: '检查工作流', apply_canvas_patch: '更新画布', generate_node: '生成作品' };

function ReferenceChip({ reference, onRemove, ImageComponent = 'img', disabled }) {
    const Icon = reference.type.includes('video') ? Video : reference.type.includes('image') ? ImageIcon : FileText;
    return <div role="group" aria-label={`引用：${reference.title}`} className={`flex max-w-full items-center gap-2 rounded-lg border px-2 py-1.5 ${reference.missing ? 'border-destructive/50' : 'border-border bg-muted/40'}`}>
        {reference.preview_url && !reference.missing ? <ImageComponent src={reference.preview_url} alt="" className="h-9 w-9 shrink-0 rounded object-cover" />
            : <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-muted"><Icon className="h-4 w-4 text-muted-foreground" /></span>}
        <span className="min-w-0 max-w-36 truncate text-xs">{reference.title}{reference.missing ? '（已删除）' : ''}</span>
        {onRemove && <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" disabled={disabled} aria-label={`移除引用：${reference.title}`} onClick={onRemove}><X className="h-3 w-3" /></Button>}
    </div>;
}

export default function CanvasAgentPanel({ open, ready, projectId, models, width = 480, onOpen, onClose, onAction, nodeName,
    picking = false, references = [], onStartPicking, onStopPicking, onRemoveReference, onClearReferences, ImageComponent, resolveMedia }) {
    const [sessions, setSessions] = useState([]), [currentId, setCurrentId] = useState(null), [session, setSession] = useState(null);
    const [modelId, setModelId] = useState(''), [draft, setDraft] = useState(''), [sending, setSending] = useState(false);
    const [error, setError] = useState(''), [available, setAvailable] = useState(null);
    const [showActivity, setShowActivity] = useState(false);
    const actions = session?.actions || [];
    const pendingActions = actions.filter(action => ['pending','approved','approval'].includes(action.status));
    const completedActions = actions.filter(action => !['pending','approved','approval'].includes(action.status));
    const visibleActions = showActivity ? actions.slice(-12) : pendingActions;
    const actionRef = useRef(onAction); actionRef.current = onAction;
    const activeId = useRef(currentId); activeId.current = currentId;
    const statusRef = useRef(session?.status); statusRef.current = session?.status;
    const clientRef = useRef(null), pollBusy = useRef(false), alive = useRef(true), endRef = useRef(null);
    const inputRef = useRef(null), wasPicking = useRef(false);
    useEffect(() => {if (wasPicking.current && !picking && open) inputRef.current?.focus();wasPicking.current=picking;}, [picking,open]);
    const textModels = models.filter(model => model.platformOperation === 'text.generate');
    const ensureClient = useCallback(() => {
        if (!clientRef.current) {
            const storage = captureProjectStorage();
            const id = storage.getItem('elren_agent_client') || crypto.randomUUID();
            storage.setItem('elren_agent_client', id); clientRef.current = id;
        }
        return clientRef.current;
    }, []);
    useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
    useEffect(() => {
        if (!ready || !projectId) return;
        let disposed = false;
        ensureClient();
        Promise.all([api(`/canvas-agent/sessions?project_id=${encodeURIComponent(projectId)}`), api('/canvas-agent/status')])
            .then(([data, status]) => {
                if (disposed) return;
                setSessions(data.items); setCurrentId(data.items[0]?.id || null); setAvailable(status.available);
                setModelId(textModels[0]?.id || '');
            }).catch(e => { if (!disposed) setError(e.message); });
        return () => { disposed = true; };
    }, [ready, projectId, ensureClient]);

    const refresh = useCallback(async () => {
        if (!currentId || pollBusy.current) return;
        pollBusy.current = true;
        try {
            const client = ensureClient();
            const data = await api(`/canvas-agent/sessions/${currentId}?client_id=${encodeURIComponent(client)}`);
            if (!alive.current || activeId.current !== currentId) return;
            setSession(data);
            setSessions(previous => previous.map(item => item.id === data.id ? { ...item, title: data.title, status: data.status, updated_at: data.updated_at } : item));
            const execute = async () => {
                for (const action of data.actions || []) {
                    if (!alive.current || activeId.current !== currentId || !action.can_execute || !['pending','approved'].includes(action.status)) continue;
                    try {
                        const result = await actionRef.current(action);
                        if (action.tool === 'generate_node') {
                            const task = await api(`/canvas-agent/actions/${action.id}/generate`, { method:'POST',
                                body:{ client_id:client, model_id:result.modelId, input:result.input } });
                            notifyTask(task); watchTask(task.id).catch(() => {});
                        } else await api(`/canvas-agent/actions/${action.id}/result`, { method:'POST', body:{ client_id:client, result } });
                    } catch (failure) {
                        if (failure.status >= 500 || failure instanceof TypeError) { setError('连接中断，正在重试'); break; }
                        if (action.tool === 'generate_node') {
                            await api(`/canvas-agent/actions/${action.id}/result`, { method:'POST', body:{ client_id:client, result:{error:'GENERATION_PREPARATION_FAILED',message:failure.message} } });
                            setError(failure.message);
                        } else await api(`/canvas-agent/actions/${action.id}/result`, { method:'POST',
                            body:{client_id:client,result:{error:'CANVAS_ACTION_FAILED',message:failure.message}} });
                    }
                }
            };
            // Chromium lock serializes execution across tabs sharing this project's local canvas.
            if (navigator.locks) await navigator.locks.request(`elren-agent-${projectId}`, { ifAvailable:true }, lock => lock ? execute() : undefined);
            else await execute();
        } catch (failure) { if (alive.current) setError(failure.message); }
        finally { pollBusy.current = false; }
    }, [currentId, projectId, ensureClient]);
    useEffect(() => {
        if (!ready || !currentId) { setSession(null); return; }
        refresh(); const timer = setInterval(() => {if (open || active(statusRef.current)) refresh();}, 1200); return () => clearInterval(timer);
    }, [ready, currentId, refresh, open]);
    useEffect(() => {
        if (!open) return;
        const viewport = endRef.current?.closest('[data-radix-scroll-area-viewport]');
        if (viewport) viewport.scrollTop = viewport.scrollHeight;
    }, [session?.messages.length, pendingActions.length, open]);

    const send = async () => {
        if (!draft.trim() || sending || !ready) return;
        if (references.some(reference => reference.missing)) {setError('引用的节点已删除，请移除后再发送');return;}
        const rawDraft = draft;
        const text = draft.trim(); setSending(true); setError('');
        onStopPicking?.();
        try {
            let id = currentId;
            if (!id) {
                const created = await api('/canvas-agent/sessions', {method:'POST', body:{project_id:projectId, model_id:modelId || textModels[0]?.id, client_id:ensureClient()}});
                id = created.id; setSessions(previous => [created, ...previous]); setCurrentId(id); setSession(created);
            }
            const updated = await api(`/canvas-agent/sessions/${id}/messages`, {method:'POST',body:{id:crypto.randomUUID(),text,client_id:ensureClient(),references:messageReferencePayload(references)}});
            setDraft(value => value === rawDraft ? '' : value); onClearReferences?.(); setSession(updated);
            setSessions(previous => previous.map(item => item.id === updated.id ? { ...item, title: updated.title, status: updated.status, updated_at: updated.updated_at } : item));
        } catch (failure) { setError(failure.message); }
        finally { setSending(false); }
    };
    const stop = async () => {
        try { setSession(await api(`/canvas-agent/sessions/${currentId}/stop`, {method:'POST'})); setError(''); }
        catch (failure) { setError(failure.message); }
    };
    const decision = async (id, approve) => {
        try { await api(`/canvas-agent/actions/${id}/decision`, {method:'POST',body:{client_id:ensureClient(),approve}}); await refresh(); }
        catch (failure) { setError(failure.message); }
    };
    return <>
        {!open && <TooltipProvider><Tooltip><TooltipTrigger asChild>
            <Button variant="secondary" aria-label="打开 AI 创作" onClick={onOpen} className="agent-orb-button fixed bottom-5 right-5 z-50 h-[52px] w-[52px] rounded-full p-0">
                <AgentOrb />
                {active(session?.status) && <span aria-hidden="true" className="absolute right-1 top-1 h-2 w-2 rounded-full bg-foreground" />}
            </Button>
        </TooltipTrigger><TooltipContent side="left">AI 创作</TooltipContent></Tooltip></TooltipProvider>}
        {open && picking && <div role="status" data-agent-picker-toolbar className="fixed top-20 z-[70] flex -translate-x-1/2 items-center gap-4 rounded-xl border border-border bg-popover px-4 py-2.5 shadow-md lg:top-4"
            style={{left:`calc((100vw - min(${Math.max(360,width)}px, calc(100vw - 24px))) / 2)`}}>
            <div className="whitespace-nowrap"><p className="text-sm font-medium">从画布添加</p><p className="text-xs text-muted-foreground">点击节点添加引用，再次点击移除</p></div>
            <Button size="sm" variant="secondary" aria-label="退出画布引用选择" onClick={onStopPicking}>退出</Button>
        </div>}
        {open && <aside aria-label="画布创作助手" className="agent-panel fixed right-3 top-3 bottom-3 z-50 flex flex-col rounded-2xl border border-border bg-card text-foreground shadow-lg"
        style={{width:`min(${Math.max(360, width)}px, calc(100vw - 24px))`}}>
        <header className="flex h-14 shrink-0 items-center gap-2 px-4">
            <span className="shrink-0 text-sm font-medium">AI 创作</span>
            <div className='flex flex-1 min-w-0'>
                <AgentHistory sessions={sessions} currentId={currentId} disabled={sending || active(session?.status)}
                onRefresh={() => api('/canvas-agent/sessions?project_id='+encodeURIComponent(projectId)).then(data => {if (alive.current) setSessions(data.items);}).catch(e => setError(e.message))}
                onSelect={id => {activeId.current=id;setCurrentId(id);setSession(null);setError('');onClearReferences?.();onStopPicking?.();}}
                onRename={async (id,title) => {
                    const updated=await api('/canvas-agent/sessions/'+id,{method:'PATCH',body:{title}});
                    setSessions(previous => previous.map(item => item.id===id ? {...item,title:updated.title,updated_at:updated.updated_at} : item));
                    setSession(previous => previous?.id===id ? {...previous,title:updated.title,updated_at:updated.updated_at} : previous);
                }}
                onDelete={async id => {
                    await api('/canvas-agent/sessions/'+id,{method:'DELETE'});
                    setSessions(previous => previous.filter(item => item.id!==id));
                    if (activeId.current===id) {activeId.current=null;setCurrentId(null);setSession(null);setError('');onClearReferences?.();onStopPicking?.();}
                }} />
            </div>

            <div className="ml-auto flex shrink-0 gap-1">
                <Button size="icon" variant="ghost" aria-label="新建创作对话" disabled={active(session?.status)} onClick={() => {setCurrentId(null);setSession(null);setError('');onClearReferences?.();onStopPicking?.();}}><Plus className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" aria-label="关闭创作助手" onClick={onClose}><X className="h-4 w-4" /></Button>
            </div>
        </header>
        <ScrollArea className="min-h-0 flex-1 px-4">
            {!session?.messages?.length && <div className="flex min-h-64 flex-col items-center justify-center gap-2 text-center">
                <p className="text-lg font-medium">今天想创作什么？</p><p className="text-sm text-muted-foreground">描述你的想法，或选中画布内容继续修改。</p>
            </div>}
            <div className="space-y-5 pb-4">
                {session?.messages.map(message => <div key={message.id} className={message.role === 'user' ? 'ml-7 rounded-xl bg-muted px-3 py-2.5' : 'pr-4'}>
                    {!!message.references?.length && <div className="mb-2 flex flex-wrap gap-2" aria-label="消息引用">{message.references.map(reference => <ReferenceChip key={reference.node_id} reference={reference} />)}</div>}
                    {message.role === 'user' ? <p className="whitespace-pre-wrap break-words text-sm leading-6">{message.content}</p>
                        : <AgentMessage content={message.content} />}
                </div>)}
                {!!completedActions.length && <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-0 text-xs text-muted-foreground hover:bg-transparent hover:text-foreground" aria-expanded={showActivity} onClick={() => setShowActivity(value => !value)}>
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showActivity ? 'rotate-180' : ''}`} />操作记录
                </Button>}
                {visibleActions.map(action => <div key={action.id} className="rounded-xl border border-border px-3 py-2 text-sm">
                    <div className="flex items-center gap-2">{action.status === 'done' ? <Check className="h-3.5 w-3.5" /> : ['pending','approved'].includes(action.status) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                        <span>{actionLabel[action.tool] || '处理画布'}{{done:' · 已完成',failed:' · 未完成',canceled:' · 已停止',declined:' · 已取消'}[action.status] || ''}</span></div>
                    {action.tool === 'generate_node' && action.status === 'approval' && <div className="mt-2 space-y-2">
                        <p className="text-muted-foreground">生成「{nodeName(action.arguments.node_id)}」，将按当前模型规格计入使用记录。</p>
                        <div className="flex gap-2"><Button size="sm" disabled={!action.can_execute} onClick={() => decision(action.id,true)}>开始生成</Button><Button size="sm" variant="ghost" disabled={!action.can_execute} onClick={() => decision(action.id,false)}>取消</Button></div>
                    </div>}
                </div>)}
                {active(session?.status) && <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />{session.status === 'waiting_approval' ? '等待确认生成' : session.status === 'waiting_canvas' ? '正在处理画布' : '正在创作'}</p>}
                {session?.status === 'interrupted' && <p role="status" className="text-xs text-muted-foreground">处理已中断，发送新要求可继续此对话。</p>}
                {session?.status === 'stopped' && <p role="status" className="text-xs text-muted-foreground">已停止后续操作。</p>}
                <div ref={endRef} />
            </div>
        </ScrollArea>
        <div className="shrink-0 space-y-2 p-3">
            {(error || session?.error) && <p role="alert" className="text-xs text-destructive">{error || session.error}</p>}
            {available === false && <p className="text-xs text-muted-foreground">创作助手暂不可用，请稍后重试。</p>}
            <div className="rounded-xl border border-border bg-background p-2">
                {!!references.length && <div className="flex flex-wrap items-center gap-2.5 px-1 pb-1 pt-2" aria-label="本条消息的画布引用">
                    {references.map(reference => <AgentReference key={reference.node_id} reference={reference} disabled={sending} ImageComponent={ImageComponent} resolveMedia={resolveMedia} onRemove={() => onRemoveReference?.(reference.node_id)} />)}
                    {references.length >= 2 && <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground" aria-label="清除所有引用" disabled={sending} onClick={onClearReferences}><X className="h-3.5 w-3.5" /></Button>}
                </div>}
                <Textarea ref={inputRef} aria-label="创作要求" placeholder="描述想法，或告诉我如何修改…" value={draft} onChange={e => setDraft(e.target.value)}
                    onKeyDown={e => {if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {e.preventDefault();send();}}}
                    className="min-h-20 max-h-40 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0" />
                <div className="flex items-center gap-2">
                    <Button size="sm" variant={picking ? 'secondary' : 'ghost'} className="h-8 shrink-0 gap-1.5 px-2 text-xs" aria-label="从画布添加" aria-pressed={picking} disabled={sending || !ready} onClick={picking ? onStopPicking : onStartPicking}><MousePointer2 className="h-3.5 w-3.5" />从画布添加</Button>
                    {!currentId ? <DropdownMenu modal={false}>
                        <DropdownMenuTrigger asChild>
                            <Button type="button" variant="ghost" size="sm" aria-label="助手模型" disabled={!textModels.length} className="h-8 min-w-0 max-w-48">
                                <span className="truncate">{textModels.find(model => model.id === modelId)?.displayName || textModels[0]?.displayName || '暂无可用模型'}</span>
                                <ChevronDown data-icon="inline-end" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent side="top" align="start" sideOffset={8} collisionPadding={12} className="max-h-[var(--radix-dropdown-menu-content-available-height)] w-64 max-w-[calc(100vw-24px)] overflow-y-auto">
                            <DropdownMenuRadioGroup value={modelId || textModels[0]?.id || ''} onValueChange={setModelId}>
                                {textModels.map(model => <DropdownMenuRadioItem key={model.id} value={model.id}>{model.displayName}</DropdownMenuRadioItem>)}
                            </DropdownMenuRadioGroup>
                        </DropdownMenuContent>
                    </DropdownMenu>
                        : <span className="pl-2 text-xs text-muted-foreground">{textModels.find(m => m.id === session?.offering_id)?.displayName || '创作助手'}</span>}
                    <div className="ml-auto flex gap-1">{active(session?.status) && <Button variant="ghost" size="icon" aria-label="停止创作" onClick={stop}><Square className="h-4 w-4" /></Button>}
                        <Button size="icon" aria-label={active(session?.status) ? '追加创作要求' : '发送创作要求'} disabled={!draft.trim() || sending || !ready || available === false || !textModels.length} onClick={send}>{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}</Button></div>
                </div>
            </div>
        </div>
    </aside>}</>;
}
