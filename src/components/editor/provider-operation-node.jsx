import { GenerationModelPicker } from './generation-model-picker';
import { modelSelectionPatch } from '@/lib/generation-models';
import { VideoEditControls } from './video-edit-controls';
import { STRUCTURED_VIDEO_OPERATIONS } from '@/lib/video-edit';
import { ModelParameterFields } from './model-parameter-fields';
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { NodeInspector } from './node-frame';

export const VIDEO_OPERATIONS = { 'video.edit': '视频编辑', 'video.extend': '延长镜头', 'video.retake': '视频重拍', 'video.replace': '替换对象', 'video.remove': '移除对象' };
export function ProviderOperationInspector({ node, models, onChange, onReference, onRun, media = [], resolveUrl }) {
    const [busy, setBusy] = useState(false), [error, setError] = useState('');
    const operation = node.type === 'gen-model' ? 'model.generate' : node.settings?.operation || 'video.edit';
    const candidates = models.filter(item => item.platformOperation === operation), selected = candidates.find(item => item.id === node.settings?.model);
    const structured = STRUCTURED_VIDEO_OPERATIONS.includes(operation);
    const supported = !structured || selected?.inputs?.videoEdit === 1;
    return <NodeInspector label={node.type === 'gen-model' ? '3D 生成设置' : '视频处理设置'}>
        {node.type === 'video-process' && <NativeSelect aria-label="视频处理方式" value={operation} onChange={event => onChange({ operation: event.target.value, model: '' })}>{Object.entries(VIDEO_OPERATIONS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</NativeSelect>}
        <Button variant="ghost" size="sm" onClick={onReference}>＋ 参考素材</Button>
        {structured && <VideoEditControls key={operation} operation={operation} source={media.find(item => item.type === 'video')?.url} images={media.filter(item => item.type === 'image')} settings={node.settings || {}} onChange={onChange} resolveUrl={resolveUrl} />}
        <Textarea aria-label="处理要求" value={node.settings?.prompt || ''} onChange={event => onChange({ prompt: event.target.value })} placeholder={node.type === 'gen-model' ? '描述要生成的 3D 物体或场景…' : '描述修改对象、镜头变化或续写内容…'} className="mt-2 min-h-20" />
        <GenerationModelPicker kind={node.type === 'gen-model' ? 'model' : 'video'} label="处理模型" models={candidates} value={node.settings?.model} onChange={key => onChange(modelSelectionPatch(candidates.find(item => item.id === key), node.settings))} />
        <div className="mt-3 space-y-2"><ModelParameterFields fields={selected?.customParams} values={node.settings?.customParams} onChange={customParams => onChange({ customParams })} /></div>
        <Button className="mt-3" disabled={busy || !selected || !supported || !node.settings?.prompt?.trim()} onClick={async () => { setBusy(true); setError(''); try { await onRun(); } catch (e) { setError(e.message); } finally { setBusy(false); } }}>{busy ? '处理中…' : node.type === 'gen-model' ? '生成 3D' : VIDEO_OPERATIONS[operation]}</Button>
        {selected && !supported && <p role="status" className="mt-2 text-xs text-muted-foreground">当前模型暂不支持此编辑方式，请选择其他模型。</p>}
        {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
    </NodeInspector>;
}
