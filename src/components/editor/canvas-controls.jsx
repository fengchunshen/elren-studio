import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Focus, Grid3X3, Map, Workflow } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { isUiShortcutTarget } from '@/lib/ui-events';
import { fitCanvasView, getMinimapProjection, MAX_ZOOM, MIN_ZOOM, zoomAtPoint } from '@/lib/canvas-viewport';

function ControlButton({ label, description = label, active, icon: Icon, ...props }) {
    return <Tooltip>
        <TooltipTrigger asChild>
            <Button type="button" variant={active ? 'secondary' : 'ghost'} size="icon"
                className="h-9 w-9 shrink-0 rounded-xl" aria-label={label} aria-pressed={active} {...props}>
                <Icon size={19} aria-hidden="true" />
            </Button>
        </TooltipTrigger>
        <TooltipContent side="top" align="start" sideOffset={12} className="max-w-[260px] rounded-xl leading-relaxed">{description}</TooltipContent>
    </Tooltip>;
}

const CanvasMinimap = memo(function CanvasMinimap({ nodes, view, viewport, onViewChange, selectedIds, selectedId }) {
    const { t } = useTranslation();
    const dragRef = useRef(null);
    const [dragProjection, setDragProjection] = useState(null);
    const projection = useMemo(() => getMinimapProjection(nodes, view, viewport), [nodes, view, viewport]);
    // Keep the mapping fixed while dragging, even when the viewport moves outside the old bounds.
    const map = dragProjection || projection;
    const navigate = (event, drag) => {
        const { rect, projection: p, zoom } = drag;
        const worldX = ((event.clientX - rect.left) * 240 / rect.width - p.x) / p.scale;
        const worldY = ((event.clientY - rect.top) * 150 / rect.height - p.y) / p.scale;
        onViewChange({
            zoom,
            x: viewport.width / 2 - worldX * zoom,
            y: viewport.height / 2 - worldY * zoom,
        });
    };
    const finishDrag = () => { dragRef.current = null; setDragProjection(null); };
    return (
        <div className="w-60 max-w-full overflow-hidden rounded-2xl border border-border bg-card/95 shadow-lg backdrop-blur-md">
            <svg viewBox="0 0 240 150" role="img" aria-label={t('画布小地图')} tabIndex={0}
                className="block aspect-[8/5] w-full cursor-crosshair touch-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                onPointerDown={event => {
                    if (event.button !== 0) return;
                    event.preventDefault();
                    event.currentTarget.focus();
                    event.currentTarget.setPointerCapture(event.pointerId);
                    const drag = { rect: event.currentTarget.getBoundingClientRect(), projection, zoom: view.zoom };
                    dragRef.current = drag;
                    setDragProjection(projection);
                    navigate(event, drag);
                }}
                onPointerMove={event => { if (dragRef.current) navigate(event, dragRef.current); }}
                onPointerUp={finishDrag} onPointerCancel={finishDrag} onLostPointerCapture={finishDrag}
                onKeyDown={event => {
                    const direction = { ArrowLeft: [80, 0], ArrowRight: [-80, 0], ArrowUp: [0, 80], ArrowDown: [0, -80] }[event.key];
                    if (!direction) return;
                    event.preventDefault();
                    event.stopPropagation();
                    onViewChange(previous => ({ ...previous, x: previous.x + direction[0], y: previous.y + direction[1] }));
                }}>
                <title>{t('点击或拖动小地图定位，方向键移动视图')}</title>
                {nodes.map(node => (
                    <rect key={node.id} data-minimap-node={node.id}
                        x={node.x * map.scale + map.x} y={node.y * map.scale + map.y}
                        width={Math.max(2, (node.width || 320) * map.scale)} height={Math.max(2, (node.height || 240) * map.scale)}
                        rx="1" className={selectedId === node.id || selectedIds.has(node.id) ? 'fill-foreground/70' : 'fill-muted-foreground/35'} />
                ))}
                <rect data-minimap-viewport="true" x={-view.x / view.zoom * map.scale + map.x} y={-view.y / view.zoom * map.scale + map.y}
                    width={viewport.width / view.zoom * map.scale} height={viewport.height / view.zoom * map.scale}
                    className="fill-foreground/5 stroke-foreground/50" strokeWidth="1.5" rx="2" />
                {!nodes.length && <text x="120" y="79" textAnchor="middle" className="fill-muted-foreground text-[11px]">{t('暂无节点')}</text>}
            </svg>
        </div>
    );
});

export const CanvasControls = memo(function CanvasControls({
    canvasRef, nodes, view, onViewChange, preferences, onPreferencesChange, selectedIds, selectedId, rightInset = 0,
}) {
    const { t } = useTranslation();
    const [canvasSize, setCanvasSize] = useState({ width: 1, height: 1 });
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const measure = () => {
            const { width, height } = canvas.getBoundingClientRect();
            setCanvasSize({ width: Math.max(1, width), height: Math.max(1, height) });
        };
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(canvas);
        return () => observer.disconnect();
    }, [canvasRef]);
    const viewport = useMemo(() => ({ ...canvasSize, width: Math.max(1, canvasSize.width - rightInset) }), [canvasSize, rightInset]);
    const zoomTo = useCallback(zoom => onViewChange(previous => zoomAtPoint(previous, zoom, {
        x: viewport.width / 2, y: viewport.height / 2,
    })), [onViewChange, viewport]);
    const resetView = useCallback(() => onViewChange(fitCanvasView(nodes, viewport)), [nodes, viewport, onViewChange]);
    useEffect(() => {
        const handleKeyDown = event => {
            if (event.defaultPrevented || isUiShortcutTarget(event.target) || !(event.ctrlKey || event.metaKey) || event.altKey) return;
            if (event.key === '0') { event.preventDefault(); resetView(); }
            if (['+', '=', '-'].includes(event.key)) {
                event.preventDefault();
                onViewChange(previous => zoomAtPoint(previous, previous.zoom + (event.key === '-' ? -0.1 : 0.1), {
                    x: viewport.width / 2, y: viewport.height / 2,
                }));
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [resetView, onViewChange, viewport]);
    const toggle = key => onPreferencesChange(previous => ({ ...previous, [key]: !previous[key] }));
    return (
        <TooltipProvider delayDuration={250} disableHoverableContent>
        <div data-canvas-controls="true" className="absolute bottom-4 left-4 z-40 flex max-w-[calc(100%-2rem)] select-none flex-col items-start gap-2"
            onMouseDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}
            onDoubleClick={event => event.stopPropagation()} onContextMenu={event => { event.preventDefault(); event.stopPropagation(); }}>
            {preferences.minimap && <CanvasMinimap nodes={nodes} view={view} viewport={viewport} onViewChange={onViewChange} selectedIds={selectedIds} selectedId={selectedId} />}
            <div role="toolbar" aria-label={t('画布视图工具')} className="flex max-w-full items-center gap-1 rounded-2xl border border-border bg-popover/95 p-1.5 text-popover-foreground shadow-lg backdrop-blur-md">
                <ControlButton icon={Map} label={t(preferences.minimap ? '关闭小地图' : '打开小地图')} active={preferences.minimap} onClick={() => toggle('minimap')} />
                <ControlButton icon={Workflow} label={t(preferences.connections ? '隐藏节点连线' : '显示节点连线')} active={preferences.connections} onClick={() => toggle('connections')} />
                <ControlButton icon={Grid3X3} label={t(preferences.snap ? '关闭网格吸附' : '开启网格吸附')} description={t(preferences.snap ? '关闭网格吸附：自由放置节点' : '开启网格吸附：拖动结束后对齐网格')} active={preferences.snap} onClick={() => toggle('snap')} />
                <ControlButton icon={Focus} label={t('重置视图')} description={t('重置视图：居中显示全部节点（Ctrl/⌘ + 0）')} onClick={resetView} />
                <Tooltip><TooltipTrigger asChild><div className="relative flex min-w-0 items-center gap-2 px-2">
                    <Slider aria-label={t('放大/缩小画布')} min={MIN_ZOOM * 100} max={MAX_ZOOM * 100} step={1}
                        value={[Math.round(view.zoom * 100)]} onValueChange={([percent]) => zoomTo(percent / 100)}
                        className="w-24 min-w-12" />
                    <output className="w-10 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground" aria-label={t('当前缩放比例')}>
                        {Math.round(view.zoom * 100)}%
                    </output>
                </div></TooltipTrigger>
                    <TooltipContent side="top" align="end" sideOffset={12} className="rounded-xl">
                        {t('放大/缩小画布')} · {Math.round(view.zoom * 100)}%
                        <div className="mt-1 text-muted-foreground">{t('滚轮上下移动，Control + 滚轮缩放')}</div>
                    </TooltipContent>
                </Tooltip>
            </div>
        </div>
        </TooltipProvider>
    );
});
