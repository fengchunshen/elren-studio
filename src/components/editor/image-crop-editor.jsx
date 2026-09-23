import React, { useEffect, useRef, useState } from 'react';
import { Check, RotateCcw, X } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { loadImage } from '@/lib/image-processing';
import { centeredCrop, dragCrop } from '@/lib/image-crop';

const ratios = [['自由', 0], ['原图', -1], ['1:1', 1], ['4:3', 4 / 3], ['3:4', 3 / 4], ['16:9', 16 / 9], ['9:16', 9 / 16]];
const handles = { nw: [0, 0, '左上角'], n: [50, 0, '上边'], ne: [100, 0, '右上角'], e: [100, 50, '右边'], se: [100, 100, '右下角'], s: [50, 100, '下边'], sw: [0, 100, '左下角'], w: [0, 50, '左边'] };
export function ImageCropEditor({ source, name, resolveUrl, onConfirm, onClose }) {
    const [image, setImage] = useState(null), [crop, setCrop] = useState(null), [ratio, setRatio] = useState(0), [error, setError] = useState(''), [busy, setBusy] = useState(false);
    const drag = useRef(null), stage = useRef(null), latest = useRef(crop); latest.current = crop;
    useEffect(() => { let active = true; resolveUrl(source).then(loadImage).then(img => {
        if (!active) return;
        const value = { url: img.src, width: img.naturalWidth, height: img.naturalHeight }; setImage(value); setCrop(centeredCrop(value.width, value.height, 0));
    }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, [source]);
    const actualRatio = ratio === -1 && image ? image.width / image.height : ratio;
    const move = event => {
        if (!drag.current || !image) return;
        const { start, x, y, bounds, handle } = drag.current;
        const next = dragCrop(start, (event.clientX - x) * image.width / bounds.width, (event.clientY - y) * image.height / bounds.height, handle, image, actualRatio);
        latest.current = next; setCrop(next);
    };
    return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent showCloseButton={false} aria-describedby={undefined} className="inset-0 left-0 top-0 flex h-screen w-screen max-w-none translate-x-0 translate-y-0 flex-col items-center justify-center gap-4 rounded-none border-0 bg-background/95 p-6"
        onKeyDown={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
        <DialogTitle className="relative z-10 text-sm font-medium">裁剪 · {name}</DialogTitle>
        {image && crop ? <div ref={stage} role="group" aria-label="裁剪原图" className="relative shrink-0 touch-none select-none" style={{ maxWidth: 'calc(100vw - 48px)' }}
            onPointerDown={event => { if (busy || event.button !== 0) return; const handle = event.target.dataset.cropHandle || 'move'; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); drag.current = { start: crop, handle, x: event.clientX, y: event.clientY, bounds: stage.current.getBoundingClientRect() }; }}
            onPointerMove={move} onPointerUp={event => { move(event); drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
            <img src={image.url} alt={name} draggable={false} className="block max-h-[calc(100vh-180px)] max-w-[calc(100vw-48px)] object-contain" />
            <div data-crop-handle="move" role="group" tabIndex={0} aria-label="移动裁剪选区" aria-description={`${crop.x}, ${crop.y}, ${crop.width} × ${crop.height}`} className="absolute cursor-move border border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.5)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
                style={{ left: `${crop.x / image.width * 100}%`, top: `${crop.y / image.height * 100}%`, width: `${crop.width / image.width * 100}%`, height: `${crop.height / image.height * 100}%` }}
                onKeyDown={event => { if (!event.key.startsWith('Arrow')) return; event.preventDefault(); event.stopPropagation(); const step = event.shiftKey ? 10 : 1; setCrop(dragCrop(crop, event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0, event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0, 'move', image)); }}>
                {Object.entries(handles).map(([key, [left, top, label]]) => <button key={key} type="button" data-crop-handle={key} aria-label={`调整裁剪${label}`} className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 border border-black/50 bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white" style={{ left: `${left}%`, top: `${top}%`, cursor: `${key}-resize` }}
                    onKeyDown={event => { if (!event.key.startsWith('Arrow')) return; event.preventDefault(); event.stopPropagation(); const step = event.shiftKey ? 10 : 1; setCrop(dragCrop(crop, event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0, event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0, key, image, actualRatio)); }} />)}
            </div>
        </div> : !error && <p role="status">正在读取原图…</p>}
        <div className="relative z-10 flex flex-wrap items-center justify-center gap-2 rounded-2xl border border-border bg-popover p-2">
            <Button variant="ghost" onClick={onClose}><X size={16} />取消</Button>
            <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" disabled={!image || busy} aria-label="裁剪比例">{ratios.find(item => item[1] === ratio)?.[0]} ▾</Button></DropdownMenuTrigger>
                <DropdownMenuContent>{ratios.map(([label, value]) => <DropdownMenuItem key={label} onSelect={() => { setRatio(value); setCrop(centeredCrop(image.width, image.height, value === -1 ? image.width / image.height : value)); }}>{label}</DropdownMenuItem>)}</DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" size="icon" aria-label="重置裁剪" disabled={!image || busy} onClick={() => { setRatio(0); setCrop(centeredCrop(image.width, image.height, 0)); }}><RotateCcw size={16} /></Button>
            {crop && <span className="px-2 text-xs text-muted-foreground" aria-label="裁剪尺寸">{crop.width} × {crop.height}</span>}
            <Button disabled={!image || !crop || busy} onClick={async () => { setBusy(true); setError(''); try { await onConfirm(crop); } catch (e) { setError(e.message); } finally { setBusy(false); } }}><Check size={16} />{busy ? '正在裁剪…' : '确认裁剪'}</Button>
        </div>
        {error && <p role="alert" className="relative z-10 rounded-lg bg-popover p-2 text-sm text-destructive">{error}</p>}
    </DialogContent></Dialog>;
}
