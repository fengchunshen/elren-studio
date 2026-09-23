import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { timelineSegments, timelinePosition } from '@/lib/timeline';

export function TimelinePreview({ clips, onChange, disabled, VideoComponent = 'video' }) {
    const [durations, setDurations] = useState({}), [time, setTime] = useState(0), [playing, setPlaying] = useState(false), [error, setError] = useState('');
    const player = useRef(null), pendingSeek = useRef(0), dragging = useRef(null), playingRef = useRef(false);
    const segments = timelineSegments(clips, durations), total = segments.reduce((sum, item) => sum + item.length, 0);
    const position = timelinePosition(segments, time), current = position ? segments[position.index] : null;
    const ready = clips.length > 0 && segments.every(item => item.valid);
    const seek = value => { const target = timelinePosition(segments, value); if (!target) return; pendingSeek.current = target.sourceTime; setTime(value); if (current?.id === segments[target.index].id && player.current) player.current.currentTime = target.sourceTime; };
    const play = () => { player.current?.play()?.then(() => setError('')).catch(e => { setError(`无法预览：${e.message}`); setPlaying(false); }); };
    useEffect(() => { playingRef.current = playing; if (playing) play(); else player.current?.pause(); }, [playing]);
    useEffect(() => { setPlaying(false); setTime(0); pendingSeek.current = clips[0]?.start || 0; }, [clips]);
    return <div className="mb-3 space-y-2" aria-label="时间线连续预览">
        {clips.map(clip => <VideoComponent key={`${clip.id}:${clip.url}`} src={clip.url} preload="metadata" className="hidden" aria-hidden="true" onLoadedMetadata={event => { setError(''); const duration = event.currentTarget.duration; if (Number.isFinite(duration)) setDurations(values => ({ ...values, [clip.id]: duration })); }} onError={() => { setError(`无法读取片段：${clip.name || '视频'}`); setPlaying(false); }} />)}
        {current && <VideoComponent ref={player} key={current.id} src={current.url} className="max-h-40 w-full rounded-lg" preload="metadata" playsInline
            onLoadedMetadata={event => { setError(''); event.currentTarget.currentTime = Math.max(current.start, Math.min(current.end - 0.001, pendingSeek.current)); if (playingRef.current) play(); }}
            onTimeUpdate={event => {
                if (!playingRef.current) return;
                const at = event.currentTarget.currentTime;
                if (at >= current.end - 0.025) {
                    const next = segments[position.index + 1];
                    if (next) { pendingSeek.current = next.start; setTime(next.offset); }
                    else { setPlaying(false); setTime(total); }
                } else setTime(current.offset + Math.max(0, at - current.start));
            }} onEnded={() => { const next = segments[position.index + 1]; if (next && playingRef.current) { pendingSeek.current = next.start; setTime(next.offset); } else setPlaying(false); }}
            onError={() => { setError('片段播放失败'); setPlaying(false); }} />}
        <div className="flex items-center gap-2"><Button type="button" size="sm" variant="secondary" disabled={!ready} onClick={() => { if (!playing && time >= total) seek(0); setPlaying(value => !value); }}>{playing ? '暂停预览' : '连续预览'}</Button><span className="text-xs text-muted-foreground">{time.toFixed(1)} / {total.toFixed(1)} 秒</span></div>
        <Slider aria-label="时间线播放头" min={0} max={total || 1} step={0.01} value={[time]} disabled={!ready} onValueChange={([value]) => seek(value)} />
        <div className="space-y-2">{segments.map((clip, index) => <div key={clip.id} draggable={!disabled} onDragStart={event => { dragging.current = clip.id; event.dataTransfer.setData('text/plain', clip.id); event.dataTransfer.effectAllowed = 'move'; }}
            onDragOver={event => { if (!disabled && dragging.current) event.preventDefault(); }} onDragEnd={() => { dragging.current = null; }}
            onDrop={event => { event.preventDefault(); if (disabled || !dragging.current) return; const from = clips.findIndex(item => item.id === dragging.current); dragging.current = null; if (from < 0 || from === index) return; const next = [...clips], [moved] = next.splice(from, 1); next.splice(index, 0, moved); onChange({ clips: next }); }}
            className="space-y-2 rounded-lg border border-border bg-muted/30 p-2"><p className="truncate text-xs">{index + 1} · {clip.name || '视频'} · 拖动排序</p>
            {durations[clip.id] > 0 && <Slider aria-label={`裁切片段 ${index + 1}`} thumbLabels={[`片段 ${index + 1} 入点`, `片段 ${index + 1} 出点`]} min={0} max={durations[clip.id]} step={0.05} minStepsBetweenThumbs={1} value={[clip.start || 0, clip.end || durations[clip.id]]} disabled={disabled} onValueChange={([start, end]) => onChange({ clips: clips.map(item => item.id === clip.id ? { ...item, start, end } : item) })} />}
        </div>)}</div>
        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>;
}
