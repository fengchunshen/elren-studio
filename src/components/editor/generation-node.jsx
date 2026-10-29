import { modelField, modelKey, modelOptions, modelSelectionPatch } from '@/lib/generation-models';
import { PromptComposer } from './prompt-composer';
import { ModelParameterFields } from './model-parameter-fields';
import React, { useState, useRef, useEffect } from 'react';
import { Image, Video, Loader2, ArrowUp, Link, Plus, FileText, HelpCircle, X, Scan } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverTrigger } from '@/components/ui/popover';
import { GenerationPanel, GenerationModelPicker, GenerationChoice, GenerationPopover, GenerationOptions } from './generation-controls';
import { GenerationStatus } from './generation-status';

export function GenerationBody({ node, task, onPreview, onChoose, onFile, ImageComponent = 'img', VideoComponent = 'video' }) {
    const fileInput = useRef(null);
    const video = node.type.includes('video');
    const urls = [...new Set([...(task?.mjImages || []), ...(task?.output_images || []), task?.url].filter(Boolean))];
    const url = node.content || urls[0];
    const busy = task?.status === 'generating';
    const Icon = video ? Video : Image;
    return <div className="group/media relative flex h-full flex-col overflow-hidden rounded-2xl" data-generation-body aria-busy={busy}>
        <div className="relative flex min-h-0 flex-1 items-center justify-center">
            {url ? video ? <VideoComponent controls src={url} className="h-full w-full object-contain" preload="metadata" onMouseDown={event => event.stopPropagation()} />
                : <Button variant="ghost" type="button" aria-label="预览图片" aria-description="单击选中，双击预览图片；键盘按 Enter 或空格预览" data-node-drag-surface className="h-full w-full cursor-grab p-0 active:cursor-grabbing"
                    onDragStart={event => event.preventDefault()}
                    onClick={event => {
                        // Native keyboard/assistive activation has no pointer click count.
                        if (event.detail === 0 && !event.shiftKey && !event.ctrlKey && !event.metaKey) onPreview(url);
                    }}
                    onDoubleClick={event => {
                        event.stopPropagation();
                        if (!event.shiftKey && !event.ctrlKey && !event.metaKey) onPreview(url);
                    }}><ImageComponent src={url} alt="生成结果" draggable={false} className="h-full w-full object-contain" /></Button>
                : !busy && <div className="flex flex-col items-center gap-3"><Icon size={38} strokeWidth={1.2} className="text-muted-foreground/40" />{onFile && <Button type="button" size="sm" variant="ghost" onClick={() => fileInput.current?.click()}>上传{video ? '视频' : '图片'}</Button>}</div>}
            {busy && <GenerationStatus task={task} hasMedia={Boolean(url)} video={video} />}
        </div>
        {onFile && url && !busy && <Button type="button" variant="secondary" size="sm" className="absolute right-2 top-2 opacity-0 group-hover/media:opacity-100 focus-visible:opacity-100" onClick={() => fileInput.current?.click()}>更换{video ? '视频' : '图片'}</Button>}
        {onFile && <input ref={fileInput} type="file" disabled={busy} accept={video ? 'video/*' : 'image/*'} className="hidden" aria-label={video ? '上传到视频节点' : '上传到图片节点'} onChange={event => { const file = event.target.files?.[0]; if (file && !busy) onFile(file); event.target.value = ''; }} />}
        {urls.length > 1 && <div className="flex gap-1 overflow-x-auto p-2">{urls.map((item, index) => <Button key={item} variant={item === url ? 'secondary' : 'ghost'} size="sm" aria-label={`选择结果 ${index + 1}`} onClick={() => onChoose(item)}>{index + 1}</Button>)}</div>}
        {task?.status === 'reconciling' && <div role="status" className="absolute inset-x-3 bottom-3 space-y-1 rounded-lg bg-popover/95 px-3 py-2 text-xs">
            <p className="font-medium">结果待人工核对</p><p className="leading-relaxed text-muted-foreground">{task.errorMsg || '生成结果尚未确认，请先联系管理员核对。'}</p>
        </div>}
        {!busy && task?.status !== 'reconciling' && task?.errorMsg && <p role="alert" className="absolute inset-x-3 bottom-3 rounded-lg bg-popover p-2 text-xs text-destructive">{task.errorMsg}</p>}
    </div>;
}

export function GenerationInspector({ node, task, models, references, textInput, onChange, onRun, onSettings, onPort, onLocate, onRemoveReference, ImageComponent = 'img', promptCandidates, normalizeAsset }) {
    const [submission, setSubmission] = useState(null), [error, setError] = useState('');
    const submitting = useRef(false);
    const awaitingTask = submission && (!task || task.id === submission.previousTaskId);
    const busy = task?.status === 'generating' || Boolean(awaitingTask);
    const video = node.type.includes('video'), s = node.settings || {};
    const promptKey = video ? 'videoPrompt' : 'prompt';
    const model = models.find(item => modelKey(item) === s.model);
    const selected = Boolean(model);
    const parameters = model?.customParams || [];
    // Published capabilities can change while an existing node still holds an
    // old value (for example the previous hidden size=auto). Persist the same
    // valid defaults that the panel displays before the next submission.
    useEffect(() => {
        if (!model?.platformOperation) return;
        const invalid = ['resolution', 'ratio', 'duration'].some(kind => {
            const field = modelField(model, kind), options = modelOptions(model, kind);
            const value = s[kind] || s.customParams?.[field?.name];
            return value && options.length && !options.some(option => option.toLowerCase() === String(value).replace(kind === 'duration' ? /s$/i : /$^/, '').toLowerCase());
        });
        if (invalid) onChange(modelSelectionPatch(model, s));
    }, [model, s, onChange]);
    const edit = patch => { setError(''); onChange(patch); };
    const specs = [
        ['resolution', '画质', video ? ['480P', '720P', '1080P'] : ['1K', '2K', '4K']],
        ['ratio', '比例', ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9']],
        ...(video ? [['duration', '时长', ['5s', '8s', '10s']]] : []),
    ].map(([kind, label, fallback]) => {
        const field = modelField(model, kind), options = model ? modelOptions(model, kind, fallback) : [];
        return { kind, label, field, options, value: s[kind] || s.customParams?.[field?.name] || field?.defaultValue || options[0] || '' };
    }).filter(spec => spec.options.length || spec.field);
    const changeSpec = (spec, value) => edit({ [spec.kind]: value,
        ...(spec.field ? { customParams: { ...s.customParams, [spec.field.name]: value } } : {}),
        ...(spec.field?.name === 'size' ? { size: value } : {}) });
    const supportsFrames = Boolean(model?.supportsFirstLastFrame || model?.inputs?.frames);
    const incompatibleFrames = selected && !supportsFrames && references.some(ref => ['veo_start', 'veo_end'].includes(ref.inputType));
    const unavailable = references.filter(ref => ref.ready === false);
    const audioField = video && parameters.find(field => field.name === 'generate_audio' && field.type === 'boolean');
    const extraParameters = parameters.filter(field => field !== audioField && !specs.some(spec => spec.field?.name === field.name) && !['n', 'count'].includes(field.name));
    const countOptions = model ? modelOptions(model, 'count', [1, 2, 4, 9]) : [];
    const countField = modelField(model, 'count');
    if (model?.platformOperation && !countOptions.length) {
        if (countField?.max) for (const count of [1, 2, 4, 9]) { if (count >= (countField.min ?? 1) && count <= countField.max) countOptions.push(String(count)); }
        if (!countOptions.length) countOptions.push('1');
    }
    const summary = ['ratio', 'resolution', 'duration'].map(kind => specs.find(spec => spec.kind === kind)).filter(Boolean)
        .map(spec => spec.value === 'auto' ? '自适应' : spec.kind === 'duration' && !String(spec.value).endsWith('s') ? `${spec.value}s` : spec.value).join(' · ');
    return <GenerationPanel label={video ? '视频生成设置' : '图片生成设置'}>
        <div className="mb-2 flex max-h-20 flex-wrap items-center gap-1.5 overflow-y-auto">
            {references.map((ref, index) => <div key={`${ref.sourceNodeId}-${index}`} className="flex max-w-56 items-center rounded-xl bg-secondary">
                <Button type="button" variant="ghost" size="sm" className="h-10 min-w-0 gap-2 rounded-xl px-2 text-xs" onClick={() => onLocate(ref.sourceNodeId)}>
                    {ref.thumbnail ? <ImageComponent src={ref.thumbnail} alt="" className="h-7 w-7 shrink-0 rounded object-cover" /> : <Link size={13} />}
                    <span className="min-w-0 text-left"><span className="block truncate">{ref.label}</span>{ref.ready === false && <span className="block truncate text-[10px] text-muted-foreground">{ref.status}</span>}</span>
                </Button>
                {onRemoveReference && <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" aria-label={`移除参考：${ref.label}`} onClick={() => onRemoveReference(ref.sourceNodeId, ref.inputType)}><X size={12} /></Button>}
            </div>)}
            <Button type="button" variant="secondary" size="icon" className="h-8 w-8 rounded-xl shadow-none" aria-label="添加参考" onClick={() => onPort('default')}><Plus size={17} /></Button>
            {textInput && <Popover><PopoverTrigger asChild><Button type="button" variant="ghost" size="icon" className="h-8 w-8 rounded-xl text-muted-foreground" aria-label="查看参考文本"><FileText size={15} /></Button></PopoverTrigger>
                <GenerationPopover className="whitespace-pre-wrap text-sm leading-relaxed" aria-label="参考文本">{textInput}</GenerationPopover>
            </Popover>}
            <Popover><PopoverTrigger asChild><Button type="button" variant="ghost" size="icon" className="ml-auto h-8 w-8 rounded-xl text-muted-foreground" aria-label="提示词帮助"><HelpCircle size={15} /></Button></PopoverTrigger>
                <GenerationPopover className="w-60 text-xs leading-relaxed" aria-label="提示词帮助">输入 @ 引用画布或素材库，输入 / 使用快捷指令。</GenerationPopover>
            </Popover>
        </div>
        <PromptComposer kind={video ? 'video' : 'image'} hasImageReference={references.some(ref => ref.ready !== false && ref.thumbnail)} references={s.promptReferences} candidates={promptCandidates} normalizeAsset={normalizeAsset} compact aria-label={video ? '视频提示词' : '图片提示词'} value={s[promptKey] || ''} onChange={(value, promptReferences) => edit({ [promptKey]: value, promptReferences })}
            placeholder="描述你想生成的内容…" className="min-h-24 max-h-64 overflow-y-auto border-0 bg-transparent text-sm leading-relaxed shadow-none" />
        {video && (model?.inputs?.shots || s.shots?.length) && <details className="my-2 text-xs"><summary className="cursor-pointer text-muted-foreground">多镜头</summary>
            <div className="mt-2 max-h-48 space-y-2 overflow-y-auto">{(s.shots || []).map((shot, index) => <div key={shot.id} className="rounded-lg border border-border p-2"><div className="flex items-center gap-2"><span>镜头 {index + 1}</span><Input aria-label={`镜头 ${index + 1} 时长`} type="number" min={0.5} step={0.5} value={shot.duration} className="w-20" onChange={event => edit({ shots: s.shots.map(item => item.id === shot.id ? { ...item, duration: Number(event.target.value) } : item) })} /><span>秒</span><Button size="sm" variant="ghost" aria-label={`删除镜头 ${index + 1}`} onClick={() => edit({ shots: s.shots.filter(item => item.id !== shot.id) })}>×</Button></div><Textarea aria-label={`镜头 ${index + 1} 描述`} value={shot.prompt} onChange={event => edit({ shots: s.shots.map(item => item.id === shot.id ? { ...item, prompt: event.target.value } : item) })} className="mt-1 min-h-12" /></div>)}</div>
            <Button variant="ghost" size="sm" onClick={() => edit({ shots: [...(s.shots || []), { id: crypto.randomUUID(), prompt: '', duration: 3 }] })}>＋ 添加镜头</Button>
        </details>}
        <div className="mt-3 flex flex-wrap items-center gap-1">
            <GenerationModelPicker kind={video ? 'video' : 'image'} models={models} value={s.model} onChange={key => edit(modelSelectionPatch(models.find(item => modelKey(item) === key), s))} onSettings={onSettings} />
            {(specs.length > 0 || extraParameters.length > 0 || audioField || supportsFrames) && <><span aria-hidden="true" className="mx-1 h-4 w-px bg-border" />
            <Popover><PopoverTrigger asChild><Button type="button" variant="ghost" aria-label="生成规格" className="h-9 min-w-0 gap-1 rounded-xl px-2 text-sm data-[state=open]:bg-muted">
                <Scan size={16} className="shrink-0" /><span className="truncate">{video && supportsFrames && s.useFirstLastFrame ? '首尾帧 · ' : ''}{summary || '生成参数'}</span>
            </Button></PopoverTrigger>
                <GenerationPopover className="space-y-4 bg-muted" aria-label="生成规格">
                    {video && supportsFrames && <>
                        <Label className="flex items-center gap-2 text-xs"><Checkbox checked={Boolean(s.useFirstLastFrame)} onCheckedChange={value => edit({ useFirstLastFrame: value })} />使用首尾帧</Label>
                        {s.useFirstLastFrame && <div className="flex gap-2"><Button type="button" variant="secondary" size="sm" onClick={() => onPort('veo_start')}>连接首帧</Button><Button type="button" variant="secondary" size="sm" onClick={() => onPort('veo_end')}>连接尾帧</Button></div>}
                    </>}
                    {specs.map(spec => spec.options.length ? <GenerationOptions key={spec.kind} label={spec.label} value={String(spec.value)} values={spec.options} onChange={value => changeSpec(spec, value)} ratios={spec.kind === 'ratio'} horizontal={spec.kind === 'duration'} formatValue={value => spec.kind === 'duration' && !String(value).endsWith('s') ? `${value}s` : value} />
                        : <ModelParameterFields key={spec.kind} immersive fields={[{ ...spec.field, label: spec.label }]} values={{ [spec.field.name]: spec.value }} onChange={values => changeSpec(spec, values[spec.field.name])} />)}
                    {audioField && <GenerationOptions label="生成音频" values={['开启', '关闭']} value={(s.customParams?.generate_audio ?? audioField.defaultValue) ? '开启' : '关闭'} onChange={value => edit({ customParams: { ...s.customParams, generate_audio: value === '开启' } })} />}
                    {!video && /midjourney|\bmj\b/i.test(`${model?.id} ${model?.provider}`) && <div className="flex gap-2"><Button type="button" variant="secondary" size="sm" onClick={() => onPort('oref')}>主体参考</Button><Button type="button" variant="secondary" size="sm" onClick={() => onPort('sref')}>风格参考</Button></div>}
                    {extraParameters.length > 0 && <details className="text-xs"><summary className="cursor-pointer px-1 text-muted-foreground">更多参数</summary><div className="mt-3 space-y-3"><ModelParameterFields immersive fields={extraParameters} values={s.customParams} onChange={customParams => edit({ customParams })} /></div></details>}
                </GenerationPopover>
            </Popover></>}
            <div className="ml-auto flex items-center gap-1">
            {!video && countOptions.length > 1 && <GenerationChoice label="生成数量" value={s.concurrentImages || 1} options={countOptions.map(n => ({ value: n, label: `${n} 张` }))} onChange={value => edit({ concurrentImages: Number(value), imageConcurrency: Number(value) })}>{s.concurrentImages || 1}×</GenerationChoice>}
            <Button size="icon" type="button" className="h-9 w-9 shrink-0 rounded-full shadow-none" aria-label={busy ? '正在生成' : '开始生成'} disabled={busy || !selected || incompatibleFrames || unavailable.length > 0 || !(s[promptKey]?.trim() || textInput?.trim() || s.shots?.some(shot => shot.prompt.trim()))}
                onClick={async () => {
                    if (busy || submitting.current) return;
                    submitting.current = true; setSubmission({ previousTaskId: task?.id }); setError('');
                    try { await onRun(); } catch (e) { setError(e.message); }
                    finally { submitting.current = false; setSubmission(null); }
                }}>
                {busy ? <Loader2 size={15} className="animate-spin" /> : <ArrowUp size={17} />}
            </Button>
            </div>
        </div>
        {incompatibleFrames && <p role="status" className="mt-2 text-xs text-muted-foreground">当前模型不支持已连接的首尾帧，请更换模型或调整参考连接。</p>}
        {unavailable.length > 0 && <p role="status" className="mt-2 text-xs text-muted-foreground">参考尚不可用：{unavailable.map(ref => `${ref.label}（${ref.status}）`).join('、')}。请等待结果或移除该参考。</p>}
        {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
    </GenerationPanel>;
}
