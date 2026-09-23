import { GenerationModelPicker } from './generation-model-picker';
import { GenerationChoice } from './generation-controls';
import { modelSelectionPatch } from '@/lib/generation-models';
import { Checkbox } from '@/components/ui/checkbox';
import { ModelParameterFields } from './model-parameter-fields';
import React, { useEffect, useRef, useState } from 'react';
import { AudioLines, ArrowUp, Loader2, Download, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { NodeInspector } from './node-frame';

export function AudioBody({ node, onFile, onDownload, onInsertText }) {
    const canvas = useRef(null), player = useRef(null), input = useRef(null);
    const [duration, setDuration] = useState(0), [time, setTime] = useState(0), [wave, setWave] = useState([]), [error, setError] = useState('');
    useEffect(() => {
        if (!node.content) return;
        let cancelled = false;
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        let context; try { context = new AudioContext(); } catch { return; }
        fetch(node.content).then(response => { if (!response.ok) throw new Error('读取失败'); return response.arrayBuffer(); })
            .then(data => context.decodeAudioData(data)).then(buffer => {
                const data = buffer.getChannelData(0), bars = 160;
                const amplitudes = Array.from({ length: bars }, (_, index) => {
                    const from = Math.floor(index * data.length / bars), to = Math.floor((index + 1) * data.length / bars);
                    let peak = 0; for (let i = from; i < to; i++) peak = Math.max(peak, Math.abs(data[i])); return peak;
                });
                if (!cancelled) { setWave(amplitudes); setDuration(buffer.duration); }
            }).catch(() => { if (!cancelled) setWave([]); }).finally(() => context.close());
        return () => { cancelled = true; };
    }, [node.content]);
    useEffect(() => {
        const ctx = canvas.current?.getContext('2d'); if (!ctx) return;
        ctx.clearRect(0, 0, 480, 90);
        wave.forEach((value, index) => { ctx.fillStyle = index / wave.length <= time / duration ? '#a1a1aa' : '#52525b'; const height = Math.max(2, value * 80); ctx.fillRect(index * 3, (90 - height) / 2, 2, height); });
    }, [wave, time, duration]);
    return <div className="flex h-full flex-col gap-3 overflow-y-auto p-4">
        {node.content ? <><canvas ref={canvas} width={480} height={90} className="h-20 w-full cursor-pointer" role="slider" tabIndex={0} aria-label="音频播放位置" aria-valuemin={0} aria-valuemax={Number.isFinite(duration) ? duration : 0} aria-valuenow={time}
                onPointerDown={event => { const rect = event.currentTarget.getBoundingClientRect(); if (player.current && Number.isFinite(duration)) player.current.currentTime = Math.max(0, Math.min(duration, (event.clientX - rect.left) / rect.width * duration)); }}
                onKeyDown={event => { if (!player.current || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return; event.preventDefault(); event.stopPropagation(); player.current.currentTime = Math.max(0, Math.min(duration, time + (event.key === 'ArrowRight' ? 5 : -5))); }} />
            <audio ref={player} src={node.content} controls className="h-9 w-full" onTimeUpdate={event => setTime(event.currentTarget.currentTime)} onLoadedMetadata={event => setDuration(event.currentTarget.duration)} onError={() => setError('音频无法播放，请重新上传或检查素材。')} />
            <div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">{Number.isFinite(duration) ? `${Math.floor(duration / 60)}:${String(Math.floor(duration % 60)).padStart(2, '0')}` : ''}</span><Button variant="ghost" size="sm" onClick={() => onDownload(node.content)}><Download size={13} />下载</Button></div></>
            : <div className="flex flex-col items-center gap-3 text-muted-foreground"><AudioLines size={32} strokeWidth={1.3} /><Button variant="ghost" size="sm" onClick={() => input.current?.click()}><Upload size={14} />上传音频</Button></div>}
        <Input ref={input} type="file" accept="audio/*" className="hidden" onChange={async event => { const file = event.target.files?.[0]; if (!file) return; setError(''); try { await onFile(file); } catch (e) { setError(e.message); } event.target.value = ''; }} />
        {node.settings?.text && <details className="text-xs"><summary className="cursor-pointer text-muted-foreground">字幕文本</summary><p className="my-2 whitespace-pre-wrap select-text">{node.settings.text}</p><Button variant="outline" size="sm" onClick={onInsertText}>字幕放入画布</Button></details>}
        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>;
}

export function AudioInspector({ node, models, text, onChange, onRun, onSettings }) {
    const [busy, setBusy] = useState(false), [error, setError] = useState('');
    const purpose = node.settings?.audioPurpose || 'all';
    const available = models.filter(item => purpose === 'all' || item.inputs?.audioPurpose === purpose);
    const selected = available.find(item => (item._uid || item.id) === node.settings?.model);
    const placeholder = { speech: '输入要朗读的文字…', music: '描述音乐风格、情绪和节奏…', sound: '描述要生成的声音和环境…' }[selected?.inputs?.audioPurpose || purpose] || '输入要朗读的文字，或描述音乐和音效…';
    return <NodeInspector label="音频生成设置">
        <GenerationChoice label="音频用途" value={purpose} options={[{ value: 'all', label: '全部用途' }, { value: 'speech', label: '配音' }, { value: 'music', label: '音乐' }, { value: 'sound', label: '音效' }]} onChange={audioPurpose => onChange({ audioPurpose, model: '', customParams: {} })} />

        {text && <p className="mb-2 line-clamp-2 text-xs text-muted-foreground">{text}</p>}
        <Textarea aria-label="音频提示词" placeholder={placeholder} value={node.settings?.prompt || ''} onChange={event => onChange({ prompt: event.target.value })} className="min-h-20 border-0 bg-transparent shadow-none" />
        <div className="mt-2 flex items-center gap-2"><GenerationModelPicker kind="audio" label="音频模型" models={available} value={node.settings?.model} onChange={key => onChange(modelSelectionPatch(available.find(item => (item._uid || item.id) === key), node.settings))} onSettings={onSettings} />
            <Button size="icon" className="h-9 w-9 rounded-full" aria-label="生成音频" disabled={busy || !selected || !(text.trim() || node.settings?.prompt?.trim())} onClick={async () => { setBusy(true); setError(''); try { await onRun(); } catch (e) { setError(e.message); } finally { setBusy(false); } }}>{busy ? <Loader2 size={16} className="animate-spin" /> : <ArrowUp size={17} />}</Button></div>
        {Number.isFinite(selected?.inputs?.max) && <p className="mt-2 text-xs text-muted-foreground">{selected.inputs.max === 0 ? '无需参考素材' : `最多 ${selected.inputs.max} 项参考`}</p>}
        <Label className="mt-2 flex items-center gap-2 text-xs"><Checkbox checked={node.settings?.autoCaption !== false} onCheckedChange={value => onChange({ autoCaption: value })} />返回字幕时自动创建文字节点</Label>
        {selected?.customParams?.length > 0 && <details className="mt-2 text-xs"><summary className="cursor-pointer text-muted-foreground">声音与输出设置</summary><div className="mt-3 space-y-2"><ModelParameterFields fields={selected.customParams} values={node.settings?.customParams} onChange={customParams => onChange({ customParams })} /></div></details>}
        {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
    </NodeInspector>;
}
