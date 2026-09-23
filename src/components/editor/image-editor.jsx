import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { EditorDialog } from './editor-dialog';
import { renderImageDocument, loadImage } from '@/lib/image-processing';

export function ImageEditor({ node, source, resolveAsset, onSave, onSend, onClose }) {
    const initial = node.settings?.imageDocument || { width: 1200, height: 900, background: 'transparent', layers: source ? [{ id: crypto.randomUUID(), type: 'image', url: source, x: 0, y: 0, width: 1200, height: 900 }] : [] };
    const [value, setValue] = useState(initial), [tool, setTool] = useState('rectangle'), [color, setColor] = useState('#e4e4e7'), [text, setText] = useState('文字'), [selected, setSelected] = useState(null);
    const [error, setError] = useState(''), [busy, setBusy] = useState(false);
    const history = useRef([]), canvas = useRef(null), draft = useRef(null), renderSequence = useRef(0), file = useRef(null);
    const change = next => { history.current.push(value); setValue(next); setError(''); };
    useEffect(() => {
        if (source && !node.settings?.imageDocument) Promise.resolve(resolveAsset ? resolveAsset(source) : source).then(loadImage).then(image => setValue(previous => history.current.length ? previous : { ...previous, width: image.naturalWidth, height: image.naturalHeight, layers: previous.layers.map(layer => layer.type === 'image' && layer.url === source ? { ...layer, width: image.naturalWidth, height: image.naturalHeight } : layer) })).catch(e => setError(e.message));
    }, [source]);
    useEffect(() => {
        let cancelled = false; const sequence = ++renderSequence.current;
        const buffer = document.createElement('canvas');
        renderImageDocument(value, buffer, resolveAsset).then(() => {
            if (!cancelled && sequence === renderSequence.current && canvas.current) { canvas.current.width = buffer.width; canvas.current.height = buffer.height; canvas.current.getContext('2d').drawImage(buffer, 0, 0); }
        }).catch(e => !cancelled && setError(e.message));
        return () => { cancelled = true; };
    }, [value]);
    const point = event => { const rect = canvas.current.getBoundingClientRect(); return [(event.clientX - rect.left) * value.width / rect.width, (event.clientY - rect.top) * value.height / rect.height]; };
    return <EditorDialog isOpen onClose={onClose} title="图片编辑器" className="w-[1100px] max-w-[95vw]" bodyClassName="p-4">
        <div className="flex flex-wrap items-center gap-2">
            <NativeSelect aria-label="编辑工具" value={tool} onChange={event => setTool(event.target.value)}>{[['rectangle', '矩形标注'], ['stroke', '画笔'], ['text', '文字'], ['move', '移动图层']].map(([key, label]) => <option key={key} value={key}>{label}</option>)}</NativeSelect>
            <Input type="color" aria-label="绘制颜色" value={color} onChange={event => setColor(event.target.value)} className="w-12 p-1" />
            {tool === 'text' && <Input aria-label="添加文字" value={text} onChange={event => setText(event.target.value)} className="w-40" />}
            <Button variant="outline" onClick={() => file.current?.click()}>添加图片</Button>
            <Input ref={file} type="file" className="hidden" accept="image/*" onChange={event => { const input = event.target.files?.[0]; if (!input) return; const reader = new FileReader(); reader.onload = () => change({ ...value, layers: [...value.layers, { id: crypto.randomUUID(), type: 'image', url: reader.result, x: 0, y: 0, width: value.width, height: value.height }] }); reader.readAsDataURL(input); event.target.value = ''; }} />
            <Button variant="ghost" disabled={!history.current.length} onClick={() => setValue(history.current.pop())}>撤销</Button>
            <div className="ml-auto flex items-center gap-1"><Label htmlFor="image-editor-width">宽</Label><Input id="image-editor-width" type="number" className="w-20" value={value.width} onChange={event => setValue({ ...value, width: Number(event.target.value) })} /><Label htmlFor="image-editor-height">高</Label><Input id="image-editor-height" type="number" className="w-20" value={value.height} onChange={event => setValue({ ...value, height: Number(event.target.value) })} /></div>
        </div>
        <div className="mt-3 flex h-[min(60vh,600px)] gap-3">
            <div className="flex min-w-0 flex-1 items-center justify-center overflow-auto rounded-xl bg-muted/40 p-4">
                <canvas ref={canvas} className="max-h-full max-w-full touch-none border border-border" aria-label="图片编辑画布"
                    onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); const [x, y] = point(event); const base = document.createElement('canvas'); base.width = canvas.current.width; base.height = canvas.current.height; base.getContext('2d').drawImage(canvas.current, 0, 0); draft.current = { x, y, points: [[x, y]], base }; }}
                    onPointerMove={event => {
                        if (!draft.current || tool === 'move') return;
                        const [x, y] = point(event), start = draft.current, context = canvas.current.getContext('2d');
                        context.clearRect(0, 0, value.width, value.height); context.drawImage(start.base, 0, 0); context.strokeStyle = color; context.lineWidth = 3; context.lineCap = 'round';
                        if (tool === 'stroke') { start.points.push([x, y]); context.beginPath(); start.points.forEach(([px, py], index) => index ? context.lineTo(px, py) : context.moveTo(px, py)); context.stroke(); }
                        if (tool === 'rectangle') context.strokeRect(start.x, start.y, x - start.x, y - start.y);
                    }}
                    onPointerUp={event => {
                        if (!draft.current) return; const start = draft.current, [x, y] = point(event); draft.current = null;
                        if (tool === 'move') { if (selected) change({ ...value, layers: value.layers.map(layer => layer.id === selected ? { ...layer, x: (layer.x || 0) + x - start.x, y: (layer.y || 0) + y - start.y, ...(layer.points ? { points: layer.points.map(([px, py]) => [px + x - start.x, py + y - start.y]) } : {}) } : layer) }); return; }
                        const layer = { id: crypto.randomUUID(), type: tool, color, x: Math.min(x, start.x), y: Math.min(y, start.y), width: Math.abs(x - start.x), height: Math.abs(y - start.y), text, points: [...start.points, [x, y]] };
                        change({ ...value, layers: [...value.layers, layer] }); setSelected(layer.id);
                    }} onPointerCancel={() => { draft.current = null; }} />
            </div>
            <aside className="w-40 shrink-0 overflow-y-auto"><p className="mb-2 text-xs text-muted-foreground">图层</p>{[...value.layers].reverse().map((layer, index) => <div key={layer.id} className="mb-1 flex gap-1"><Button variant={selected === layer.id ? 'secondary' : 'ghost'} size="sm" className="min-w-0 flex-1 truncate" onClick={() => setSelected(layer.id)}>{({ image: '图片', text: '文字', rectangle: '矩形', stroke: '画笔' })[layer.type]} {value.layers.length - index}</Button><Button size="sm" variant="ghost" aria-label={`移除图层 ${value.layers.length - index}`} onClick={() => change({ ...value, layers: value.layers.filter(item => item.id !== layer.id) })}>×</Button></div>)}</aside>
        </div>
        {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
        <div className="mt-3 flex justify-end gap-2">{onSend && <Button variant="outline" disabled={busy} onClick={async () => { setBusy(true); setError(''); try { const output = await renderImageDocument(value, document.createElement('canvas'), resolveAsset); await onSave(value, output); onSend(output); onClose(); } catch (e) { setError(e.message); } finally { setBusy(false); } }}>保存并放入对话</Button>}<Button disabled={busy} onClick={async () => { setBusy(true); setError(''); try { const output = await renderImageDocument(value, document.createElement('canvas'), resolveAsset); await onSave(value, output); onClose(); } catch (e) { setError(e.message); } finally { setBusy(false); } }}>{busy ? '保存中…' : '保存到画布'}</Button></div>
    </EditorDialog>;
}
