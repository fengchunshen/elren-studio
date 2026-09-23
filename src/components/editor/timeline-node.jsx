import { TimelinePreview } from './timeline-preview';
import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { api } from '@/services/apiClient';
import { renderTimeline } from '@/services/mediaJobs';
import { NodeInspector } from './node-frame';

export function TimelineBody({ node, clips, onAdd, VideoComponent = 'video' }) {
    return <div className="flex h-full flex-col gap-2 overflow-hidden p-3">
        {node.content ? <VideoComponent src={node.content} controls className="min-h-0 w-full flex-1 rounded-lg" /> : <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">{clips.length ? `${clips.length} 个视频片段` : '按顺序串联视频片段'}</div>}
        <div className="flex gap-1 overflow-x-auto">{clips.map((clip, index) => <span key={clip.id} className="shrink-0 rounded-md bg-muted px-3 py-2 text-xs">{index + 1} · {clip.name || '视频'}</span>)}<Button variant="ghost" size="sm" onClick={onAdd}>＋ 添加视频</Button></div>
    </div>;
}

export function TimelineInspector({ node, clips, onChange, jobState, onLocate, onSyncConnected, VideoComponent = 'video', resolveMedia }) {
    const [busy, setBusy] = useState(false), [error, setError] = useState(''), [localJob, setJob] = useState(null);
    const job = jobState || localJob;
    useEffect(() => {
        if (jobState?.status === 'failed') setError(jobState.error || '视频处理失败');
        else if (jobState?.status === 'canceled') setError('已取消处理');
    }, [jobState]);
    const editClip = (id, patch) => onChange({ clips: clips.map(item => item.id === id ? { ...item, ...patch } : item) });
    const players = useRef(new Map());
    const cutClip = clip => {
        const player = players.current.get(clip.id), middle = player?.currentTime, end = clip.end || player?.duration;
        if (!Number.isFinite(middle) || middle - (clip.start || 0) < 1 || end - middle < 1) { setError('切点两侧至少保留 1 秒'); return; }
        onChange({ clips: clips.flatMap(item => item.id === clip.id ? [{ ...item, end: middle }, { ...item, id: crypto.randomUUID(), start: middle, end }] : [item]) });
    };
    const move = (index, direction) => { const next = [...clips], other = index + direction; [next[index], next[other]] = [next[other], next[index]]; onChange({ clips: next }); };
    const running = busy || ['queued', 'running'].includes(job?.status);
    return <NodeInspector label="剪辑时间线设置">
        {onSyncConnected && <Button variant="outline" size="sm" disabled={running} onClick={onSyncConnected}>添加已连接视频</Button>}
        <TimelinePreview VideoComponent={VideoComponent} clips={clips} onChange={onChange} disabled={running} />
        <div className="max-h-56 space-y-2 overflow-y-auto">{clips.map((clip, index) => <div key={clip.id} className="rounded-lg border border-border p-2">
            <VideoComponent ref={element => element ? players.current.set(clip.id, element) : players.current.delete(clip.id)} src={clip.url} controls preload="metadata" className="mb-2 max-h-32 w-full"
                onPlay={event => { if (event.currentTarget.currentTime < (clip.start || 0) || (clip.end && event.currentTarget.currentTime >= clip.end)) event.currentTarget.currentTime = clip.start || 0; }}
                onTimeUpdate={event => { if (clip.end && event.currentTarget.currentTime >= clip.end) event.currentTarget.pause(); }}
                onKeyDown={event => { if (event.key.toLowerCase() === 'c') { event.preventDefault(); cutClip(clip); } }} />
            <div className="mb-2 flex items-center gap-1"><Button variant="ghost" size="sm" className="min-w-0 flex-1 justify-start truncate" onClick={() => onLocate(clip.nodeId)}>{index + 1} · {clip.name || '视频'}</Button><Button size="sm" variant="ghost" aria-label={`上移片段 ${index + 1}`} disabled={!index || running} onClick={() => move(index, -1)}>↑</Button><Button size="sm" variant="ghost" aria-label={`下移片段 ${index + 1}`} disabled={index === clips.length - 1 || running} onClick={() => move(index, 1)}>↓</Button><Button variant="ghost" size="sm" aria-label={`移除片段 ${index + 1}`} disabled={running} onClick={() => onChange({ clips: clips.filter(item => item.id !== clip.id) })}>×</Button></div>
            <div className="flex items-center gap-2 text-xs"><span>入点</span><Input type="number" min={0} step={0.1} aria-label={`片段 ${index + 1} 入点`} value={clip.start || 0} onChange={event => editClip(clip.id, { start: Number(event.target.value) })} /><span>出点</span><Input type="number" min={0} step={0.1} aria-label={`片段 ${index + 1} 出点`} placeholder="片尾" value={clip.end ?? ''} onChange={event => editClip(clip.id, { end: event.target.value === '' ? null : Number(event.target.value) })} /></div>
            <Button variant="ghost" size="sm" className="mt-1" disabled={running} onClick={() => cutClip(clip)}>在播放位置切分 · C</Button>
        </div>)}</div>
        <div className="mt-3 flex items-center gap-2"><NativeSelect aria-label="成片尺寸" value={node.settings?.size || '1280x720'} onChange={event => onChange({ size: event.target.value })}><option value="1280x720">720P 横屏</option><option value="720x1280">720P 竖屏</option><option value="1920x1080">1080P 横屏</option><option value="1080x1920">1080P 竖屏</option></NativeSelect>
            <Button disabled={running || !clips.length} onClick={async () => { setBusy(true); setError(''); try { const result = await renderTimeline(clips, node.settings?.size, 'concat', resolveMedia); setJob(result); onChange({ mediaJobId: result.id }); } catch (e) { setError(e.message); } finally { setBusy(false); } }}>合并到画布</Button>
            {running && job?.id && <Button variant="ghost" onClick={async () => { const result = await api(`/media-jobs/${job.id}/cancel`, { method: 'POST' }); setJob(result); }}>取消</Button>}
        </div>
        {clips.length === 1 && <Button className="mt-2" variant="outline" disabled={running} onClick={async () => { setBusy(true); setError(''); try { const result = await renderTimeline(clips, node.settings?.size, 'scene_split', resolveMedia); setJob(result); onChange({ mediaJobId: result.id }); } catch (e) { setError(e.message); } finally { setBusy(false); } }}>智能识别并切分镜头</Button>}
        {running && <p role="status" className="mt-2 text-xs text-muted-foreground">{job?.status === 'running' ? `正在合并 · ${job.progress}%` : '正在准备片段…'}</p>}
        {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
        {node.content && <a className="mt-2 inline-block text-xs underline" href={node.content} download="timeline.mp4">下载合并视频</a>}
    </NodeInspector>;
}
