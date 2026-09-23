import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NativeSelect } from '@/components/ui/native-select';
import { Slider } from '@/components/ui/slider';
import { captureVideoFrame } from '@/lib/video-frames';
import { TARGET_OPERATIONS } from '@/lib/video-edit';

export function VideoEditControls({ operation, source, images, settings, onChange, resolveUrl = async url => url }) {
    const player = useRef(null), drag = useRef(null), generation = useRef(0);
    const [url, setUrl] = useState(''), [time, setTime] = useState(0), [error, setError] = useState(''), [capturing, setCapturing] = useState(false);
    const [draftBox, setDraftBox] = useState(null);
    useEffect(() => {
        const version = ++generation.current; setUrl(''); setError(''); setTime(0);
        if (source) resolveUrl(source).then(value => { if (version === generation.current) setUrl(value); }).catch(e => { if (version === generation.current) setError(e.message); });
        return () => { generation.current++; };
    }, [source]);
    const duration = settings.videoSourceUrl === source ? settings.videoSourceDuration || 0 : 0;
    const target = settings.videoSourceUrl === source ? settings.videoTarget : null;
    const point = event => { const rect = event.currentTarget.getBoundingClientRect(); return { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) }; };
    const boxAt = event => { const end = point(event), start = drag.current; return { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) }; };
    const box = draftBox || target?.box;
    const editShot = (id, patch) => onChange({ retakeShots: settings.retakeShots.map(item => item.id === id ? { ...item, ...patch } : item) });
    return <div className="my-3 space-y-2">
        {!source && <p className="text-xs text-muted-foreground">先连接一个原始视频</p>}
        {url && <><video ref={player} src={url} controls preload="metadata" className="max-h-40 w-full rounded-lg" onError={() => setError('原片读取失败，请重新选择视频')}
            onLoadedMetadata={event => {
                const length = event.currentTarget.duration;
                if (!Number.isFinite(length) || length <= 0) { setError('无法读取视频时长'); return; }
                onChange({ videoSourceDuration: length, videoSourceUrl: source, ...(settings.videoSourceUrl !== source ? { videoTarget: null, retakeShots: [] } : {}) });
            }} onTimeUpdate={event => setTime(event.currentTarget.currentTime)} />
            <Slider aria-label="选择视频帧" min={0} max={duration || 1} step={0.01} value={[time]} onValueChange={([value]) => { setTime(value); if (player.current) { player.current.pause(); player.current.currentTime = value; } }} />
            <p className="text-right text-[11px] text-muted-foreground">{time.toFixed(2)} / {duration.toFixed(2)} 秒</p>
        </>}
        {TARGET_OPERATIONS.includes(operation) && <>
            <Button type="button" variant="outline" size="sm" disabled={!duration || capturing} onClick={async () => {
                const version = generation.current; setCapturing(true); setError('');
                try { const at = Math.min(player.current?.currentTime || 0, Math.max(0, duration - 0.01)); const frame = await captureVideoFrame(url, at); if (version === generation.current) onChange({ videoTarget: { time: at, frame: frame.url, box: null } }); }
                catch (e) { setError(e.message); } finally { setCapturing(false); }
            }}>{capturing ? '正在读取画面…' : '使用当前帧圈选对象'}</Button>
            {target?.frame && <><div role="group" aria-label="拖动圈选视频对象" className="relative touch-none overflow-hidden rounded-lg border border-border" style={{ cursor: 'crosshair' }}
                onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); drag.current = point(event); event.currentTarget.setPointerCapture(event.pointerId); setDraftBox(null); }}
                onPointerMove={event => { if (drag.current) setDraftBox(boxAt(event)); }}
                onPointerUp={event => { if (!drag.current) return; const next = boxAt(event); drag.current = null; setDraftBox(null); if (next.width > 0.005 && next.height > 0.005) onChange({ videoTarget: { ...target, box: next } }); }}
                onPointerCancel={() => { drag.current = null; setDraftBox(null); }}>
                <img src={target.frame} alt={`目标帧 ${target.time.toFixed(2)} 秒`} className="pointer-events-none block w-full select-none" draggable={false} />
                {box && <div className="pointer-events-none absolute border-2 border-white bg-white/10 outline outline-1 outline-black" style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.width * 100}%`, height: `${box.height * 100}%` }} />}
            </div><div className="flex items-center gap-2"><p className="flex-1 text-xs text-muted-foreground">拖动框选目标，或使用整帧。</p><Button type="button" variant="ghost" size="sm" onClick={() => onChange({ videoTarget: { ...target, box: { x: 0, y: 0, width: 1, height: 1 } } })}>整帧</Button></div>
                {target.box && <svg aria-label="目标缩略图" className="h-20 max-w-full rounded border border-border" viewBox={`${target.box.x} ${target.box.y} ${target.box.width} ${target.box.height}`}><image href={target.frame} width="1" height="1" preserveAspectRatio="none" /></svg>}
            </>}
            {operation === 'video.replace' && <><NativeSelect aria-label="替换图片" value={settings.replacementUrl || ''} onChange={event => onChange({ replacementUrl: event.target.value })}><option value="">选择已连接的替换图片</option>{images.map((item, index) => <option key={item.url} value={item.url}>图片 {index + 1}</option>)}</NativeSelect>{settings.replacementUrl && images.some(item => item.url === settings.replacementUrl) && <img src={settings.replacementUrl} alt="替换图片预览" className="h-20 rounded object-contain" />}</>}
        </>}
        {operation === 'video.retake' && <>
            {(settings.retakeShots || []).map((shot, index) => <div key={shot.id} className="space-y-2 rounded-lg border border-border p-2"><div className="flex items-center gap-1 text-xs"><span>片段 {index + 1}</span><Button type="button" variant="ghost" size="sm" className="ml-auto" aria-label={`删除重拍片段 ${index + 1}`} onClick={() => onChange({ retakeShots: settings.retakeShots.filter(item => item.id !== shot.id) })}>×</Button></div>
                <div className="flex gap-2">{[['start', '起点'], ['end', '终点']].map(([key, label]) => <Input key={key} aria-label={`片段 ${index + 1} ${label}`} type="number" min={0} max={duration} step={0.1} value={shot[key]} onChange={event => editShot(shot.id, { [key]: Number(event.target.value) })} />)}</div>
                <div className="flex gap-1">{[['camera', '机位', [['original', '原机位'], ['front', '正面'], ['side', '侧面'], ['overhead', '俯视'], ['low', '仰视']]], ['framing', '景别', [['original', '原景别'], ['wide', '全景'], ['medium', '中景'], ['close', '特写']]], ['motion', '变化模式', [['preserve', '保留运动'], ['static', '固定镜头'], ['push', '推进'], ['pull', '拉远'], ['orbit', '环绕']]]].map(([key, label, options]) => <NativeSelect key={key} aria-label={`片段 ${index + 1} ${label}`} value={shot[key]} onChange={event => editShot(shot.id, { [key]: event.target.value })}>{options.map(([value, name]) => <option key={value} value={value}>{name}</option>)}</NativeSelect>)}</div>
                <Textarea aria-label={`重拍片段 ${index + 1} 描述`} value={shot.prompt} onChange={event => editShot(shot.id, { prompt: event.target.value })} className="min-h-14" />
            </div>)}
            <Button type="button" variant="outline" size="sm" disabled={!duration || (settings.retakeShots || []).length >= 20 || (settings.retakeShots?.at(-1)?.end || 0) >= duration} onClick={() => { const start = settings.retakeShots?.at(-1)?.end || 0; onChange({ retakeShots: [...(settings.retakeShots || []), { id: crypto.randomUUID(), start, end: Math.min(duration, start + 3), camera: 'original', framing: 'original', motion: 'preserve', prompt: '' }] }); }}>＋ 添加重拍片段</Button>
        </>}
        {operation === 'video.extend' && <><div className="flex items-center gap-2"><NativeSelect aria-label="延长方向" value={settings.videoExtension?.direction || 'after'} onChange={event => onChange({ videoExtension: { duration: 5, ...settings.videoExtension, direction: event.target.value } })}><option value="after">向后延长</option><option value="before">向前延长</option></NativeSelect><Input aria-label="延长秒数" type="number" min={0.1} max={60} step={0.1} value={settings.videoExtension?.duration ?? 5} onChange={event => onChange({ videoExtension: { direction: 'after', ...settings.videoExtension, duration: Number(event.target.value) } })} /></div><p className="text-xs text-muted-foreground">保留原片，延长结果写入当前节点。结果是否含原片由所选模型决定。</p></>}
        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>;
}
