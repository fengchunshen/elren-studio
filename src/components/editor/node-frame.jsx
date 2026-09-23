import { GenerationModelPicker } from './generation-model-picker';
import React, { createContext, useContext, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Film, FileText, Image, Video, AudioLines, Users, Loader2, ArrowUp, Link } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NODE_DEFINITIONS } from '@/lib/node-io';
import { cn } from '@/lib/utils';
import { nodeInspectorPosition } from '@/lib/node-inspector-position';
import { useOverlaysSuspended } from '@/components/ui/overlay-suspension';
import { useOverlayDismissSurface } from '@/components/ui/overlay-dismiss-surface';
import { Input } from '@/components/ui/input';
import { nodeDisplayName } from '@/lib/canvas-references';

export const MODERN_NODE_TYPES = new Set(['storyboard-node', 'image-compare', 'generate-character-image', 'generate-scene-image', 'generate-character-video', 'generate-scene-video', 'model-input', 'subject-reference', 'gen-model', 'video-process', 'image-editor', 'image-process', 'video-timeline', 'three-studio', 'audio-input', 'gen-audio', 'video-avatar', 'text-node', 'gen-image', 'gen-video', 'extract-characters-scenes', 'input-image', 'preview']);
export function NodeLabel({ node, onRename }) {
    const [editing, setEditing] = useState(false), [name, setName] = useState('');
    const cancelled = useRef(false);
    const begin = () => { if (onRename) { cancelled.current = false; setName(nodeDisplayName(node)); setEditing(true); } };
    const commit = () => { if (!cancelled.current) onRename?.(name); setEditing(false); };
    const Icon = node.type === 'storyboard-node' ? Film : node.type.includes('audio') ? AudioLines : node.type.includes('video') ? Video : node.type === 'text-node' ? FileText : node.type === 'extract-characters-scenes' ? Users : Image;
    return <div className="node-label absolute -top-8 left-1 flex h-7 max-w-full cursor-grab select-none items-center gap-2 text-xs text-muted-foreground active:cursor-grabbing">
        <Icon size={14} className="shrink-0" />{editing ? <Input autoFocus maxLength={80} aria-label="节点名称" className="h-7 w-52 px-1 text-xs" value={name}
            onFocus={event => event.target.select()} onChange={event => setName(event.target.value)} onBlur={commit}
            onMouseDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}
            onKeyDown={event => { event.stopPropagation(); if (event.nativeEvent.isComposing) return; if (event.key === 'Enter') { event.preventDefault(); commit(); } if (event.key === 'Escape') { event.preventDefault(); cancelled.current = true; setEditing(false); } }} />
            : <span className="truncate rounded focus-visible:outline focus-visible:outline-1" role={onRename ? 'button' : undefined} tabIndex={onRename ? 0 : undefined} aria-label={onRename ? `重命名节点：${nodeDisplayName(node)}` : undefined}
                onDoubleClick={event => { event.stopPropagation(); begin(); }} onKeyDown={event => { if (event.key === 'Enter') { event.stopPropagation(); begin(); } }}>{nodeDisplayName(node)}</span>}
    </div>;
}

export function NodeExtraPorts({ node, connections, selected, onPick, onConnect }) {
    const labels = { veo_start: '首帧输入', veo_end: '尾帧输入', oref: '主体参考输入', sref: '风格参考输入' };
    const ports = Object.keys(NODE_DEFINITIONS[node.type]?.inputs || {}).filter(port => labels[port]
        && (connections.some(item => item.inputType === port) || (selected && node.settings?.useFirstLastFrame && port.startsWith('veo_'))));
    return ports.map(port => <Button key={port} data-input-port={port} variant="ghost" aria-label={labels[port]} title={labels[port]}
        className="absolute -left-2 z-30 h-4 w-4 rounded-full border border-border bg-popover p-0 text-[8px]"
        style={{ top: `calc(${['veo_start', 'oref'].includes(port) ? 30 : 70}% - 8px)` }}
        onMouseDown={event => event.stopPropagation()} onMouseUp={event => { event.stopPropagation(); onConnect(event, port); }} onClick={event => { event.stopPropagation(); onPick(port); }}>＋</Button>);
}

export const NodeInspectorPanContext = createContext(null);

export function NodeInspector({ children, label = '节点设置', className, preferredWidth }) {
    const suspended = useOverlaysSuspended();
    const panCanvas = useContext(NodeInspectorPanContext);
    const anchor = useRef(null), panel = useRef(null), fittedLayout = useRef('');
    const dismissSurface = useOverlayDismissSurface(panel);
    const [position, setPosition] = useState(null);
    useLayoutEffect(() => {
        const node = anchor.current?.closest('.node-wrapper');
        if (!node) { setPosition({ left: 16, top: 72, width: 360 }); return; }
        let frame = null;
        if (suspended) fittedLayout.current = '';
        const preventPageZoom = event => { if (event.ctrlKey) { event.preventDefault(); event.stopPropagation(); } };
        const panelElement = panel.current;
        panelElement?.addEventListener('wheel', preventPageZoom, { passive: false });
        const measure = () => {
            const bounds = node.getBoundingClientRect();
            const height = panel.current?.getBoundingClientRect().height || 120;
            const layout = nodeInspectorPosition(bounds, height, { width: window.innerWidth, height: window.innerHeight }, preferredWidth);
            const { panY, ...coordinates } = layout;
            // Fit on opening, content/viewport resize or drag completion. Ordinary canvas panning
            // only moves the anchor and must not be opposed by repeated automatic corrections.
            const key = [height, bounds.width, bounds.height, window.innerWidth, window.innerHeight].join(',');
            if (!suspended && panCanvas && bounds.width > 0 && bounds.height > 0 && fittedLayout.current !== key) {
                fittedLayout.current = key;
                if (Math.abs(panY) > 0.5) {
                    coordinates.top += panY;
                    panCanvas(panY);
                }
            }
            setPosition(previous => previous && Object.keys(coordinates).every(key => previous[key] === coordinates[key]) ? previous : coordinates);

        };
        const schedule = () => {
            if (frame !== null) return;
            frame = requestAnimationFrame(() => { frame = null; measure(); });
        };
        // Track the selected node and canvas transform, not every update in the canvas.
        const observer = new MutationObserver(schedule);
        observer.observe(node, { attributes: true, attributeFilter: ['style'] });
        observer.observe(node.parentElement, { attributes: true, attributeFilter: ['style'] });
        const resize = new ResizeObserver(schedule); resize.observe(node); if (panel.current) resize.observe(panel.current);
        window.addEventListener('resize', schedule); measure();
        return () => { cancelAnimationFrame(frame); observer.disconnect(); resize.disconnect(); window.removeEventListener('resize', schedule); panelElement?.removeEventListener('wheel', preventPageZoom); };
    }, [preferredWidth, suspended, panCanvas]);
    return <><span ref={anchor} hidden />{createPortal(<section ref={dismissSurface} aria-label={label} aria-hidden={suspended || undefined} inert={suspended ? '' : undefined} data-node-inspector data-suspended={suspended} data-positioned={Boolean(position) && !suspended} data-side="bottom"
        style={{ maxHeight: 'calc(100vh - 96px)', ...position, visibility: position && !suspended ? 'visible' : 'hidden' }}
        className={cn('fixed z-40 overflow-y-auto rounded-2xl border border-border bg-popover p-3 text-foreground shadow-sm', className)}
        onMouseDown={event => event.stopPropagation()} onMouseUp={event => event.stopPropagation()} onClick={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()} onWheel={event => event.stopPropagation()}>
        {children}
    </section>, document.body)}</>;
}

export function ExtractionBody({ node, input, onConnect }) {
    const settings = node.settings || {};
    const results = settings.analysisResults;
    return <div className="flex h-full flex-col overflow-y-auto p-4 text-sm" data-extraction-body>
        {settings.isAnalyzing ? <div role="status" className="flex flex-1 items-center justify-center gap-2 text-muted-foreground"><Loader2 size={18} className="animate-spin" />正在提取角色与场景…</div>
            : results ? <div className="space-y-4">{[['characters', '角色'], ['scenes', '场景']].map(([key, label]) => <section key={key}>
                <h3 className="mb-2 text-xs text-muted-foreground">{label} · {results[key]?.length || 0}</h3>
                <div className="space-y-2">{(results[key] || []).map((item, index) => <article key={index} className="rounded-lg bg-muted/40 p-3">
                    <p className="font-medium">{item.name || item.location || `未命名${label}`}</p>
                    {item.description && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.description}</p>}
                </article>)}</div>
            </section>)}</div>
                : input ? <div className="space-y-3"><div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Link size={13} />已连接脚本</div>
                    <p className="line-clamp-6 whitespace-pre-wrap text-sm leading-relaxed">{input}</p><p className="text-xs text-muted-foreground">提取后，角色与场景将在这里显示。</p></div>
                    : <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-muted-foreground"><Users size={24} strokeWidth={1.3} /><p className="text-sm">从脚本提取角色与场景</p><Button variant="ghost" size="sm" onMouseDown={event => event.stopPropagation()} onClick={onConnect}><Link size={14} />连接文字节点</Button></div>}
        {settings.errorMsg && <p role="alert" className="mt-3 text-xs text-destructive">{settings.errorMsg}</p>}
    </div>;
}

export function ExtractionInspector({ node, input, models, onChange, onRun, onSettings }) {
    const current = node.settings?.model || '';
    const available = models.some(model => model.id === current || model._uid === current);
    const busy = node.settings?.isAnalyzing;
    return <NodeInspector label="角色提取设置">
        <div className="flex items-center gap-2">
            <GenerationModelPicker kind="text" label="提取模型" models={models} value={current} onChange={model => onChange({ model })} onSettings={onSettings} />
            <Button size="icon" className="h-9 w-9 shrink-0 rounded-full" aria-label={busy ? '正在提取' : '开始提取'} disabled={!input.trim() || !available || busy} onClick={onRun}>
                {busy ? <Loader2 size={16} className="animate-spin" /> : <ArrowUp size={17} />}
            </Button>
        </div>
        {!input.trim() && <p className="mt-1 text-xs text-muted-foreground">先连接文字或小说节点。</p>}
    </NodeInspector>;
}
