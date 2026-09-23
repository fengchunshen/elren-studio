import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUp, Check, Film, Image, Loader2, Maximize2, MoreHorizontal, Plus, Scan, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverTrigger } from '@/components/ui/popover';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { GenerationModelPicker, GenerationPopover, GenerationOptions } from './generation-controls';
import { ModelParameterFields } from './model-parameter-fields';
import { StoryboardFramePicker } from './storyboard-frame-picker';
import { modelKey, modelName, modelField, modelOptions, modelSelectionPatch } from '@/lib/generation-models';
import { storyboardFramePatch } from '@/lib/storyboard-frames';

const stop = event => event.stopPropagation();
const outputImage = shot => shot.output_images?.[shot.selectedImageIndex >= 0 ? shot.selectedImageIndex : 0] || '';
const stateLabel = shot => ({generating:'生成中',queued:'排队中',failed:'生成失败',error:'生成失败',reconciling:'待核对',done:'已生成',completed:'已生成'})[shot.status] || '待生成';

export function StoryboardCards({ nodeId, shots, mode, models, candidates, onChange, onRun, onAdd, onDelete, onMove, onHistory, onPreview, onDrop, onPaste, ImageComponent = 'img', VideoComponent = 'video' }) {
    const [selectedId, setSelectedId] = useState(null);
    const selected = shots.find(shot => shot.id === selectedId);
    const video = mode === 'video';
    const selectedIndex = shots.findIndex(shot => shot.id === selectedId);
    const model = models.find(model => modelKey(model) === selected?.model);
    const running = selected?.status === 'generating' || selected?.status === 'queued';
    const choose = shot => setSelectedId(shot.id);
    const change = patch => onChange(selected.id, patch);
    const referenceImages = selected ? [...new Set([selected.image_url, ...(selected.referenceImages || [])].filter(Boolean))] : [];
    const chooseFrame = (field, source) => change({ ...storyboardFramePatch(field, source),
        ...(!video && field === 'image_url' && referenceImages.length ? { referenceImages: [source.url, ...referenceImages.slice(1)].filter((url,index,all)=>all.indexOf(url)===index) } : {}) });
    const removeFrame = field => change({ [field]: !video && field === 'image_url' ? referenceImages[1] || '' : '', [`${field}Source`]: null,
        ...(field === 'image_url' ? { image_filename: '', ...(!video ? {referenceImages:referenceImages.slice(1)} : {}) } : {}) });
    const output = selected && (video ? selected.output_url || selected.video_url : outputImage(selected) || selected.output_url);
    const specs = selected ? ['ratio','resolution',...(video ? ['duration'] : [])].map(kind => {
        const field = modelField(model || {},kind);
        return {kind,field,options:model ? modelOptions(model,kind) : [],value:selected[kind] || field?.defaultValue || ''};
    }) : [];
    const inheritedRatio = video && selected?.image_url && /seedance/i.test(modelName(model));
    const extraFields = (model?.customParams || []).filter(field => !['ratio','aspect_ratio','size','resolution','duration','n','count'].includes(field.name))
        .map(field => field.name === 'generate_audio' ? {...field,type:'boolean',label:'生成音频'} : field);
    const patchSpec = (spec,value) => change({[spec.kind]:value,...(spec.field ? {customParams:{...selected.customParams,[spec.field.name]:value}} : {})});
    const upload = (event,field) => {
        const file=event.target.files?.[0]; if (!file) return;
        const shotId=selected.id, reader=new FileReader();
        reader.onload=()=>onChange(shotId,{[field]:reader.result,[`${field}Source`]:null,...(field==='image_url'?{image_filename:file.name,...(!video&&referenceImages.length?{referenceImages:[reader.result,...referenceImages.slice(1)]}:{})}:{})});
        reader.readAsDataURL(file); event.target.value='';
    };
    const frame = (field,label) => <div className="storyboard-reference relative overflow-hidden rounded-xl border border-border bg-muted/30">
        {selected[field] && <ImageComponent src={selected[field]} alt={label} className="h-full w-full object-contain" />}
        {!(field === 'image_url' && selected.imageSource) && <StoryboardFramePicker compact label={label} selected={Boolean(selected[field])} candidates={candidates} ImageComponent={ImageComponent}
            onSelect={source=>chooseFrame(field,source)} onUpload={event=>upload(event,field)} />}
        {field === 'image_url' && selected.imageSource && !selected[field] && <span className="flex h-full items-center justify-center px-1 text-center text-[10px] text-muted-foreground">等待画面确认</span>}
        {selected[field] && !(field === 'image_url' && selected.imageSource) && <Button type="button" variant="secondary" size="icon" className="absolute right-1 top-1 z-20 h-5 w-5 rounded-full" aria-label={`移除${label}`}
            onClick={()=>removeFrame(field)}><X size={11}/></Button>}
    </div>;
    return <div className="storyboard-cards" onPaste={event=>selected&&onPaste?.(event,selected.id)} onMouseDown={stop} onClick={stop} onDoubleClick={stop} onKeyDown={stop}>
        <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {selected && <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={()=>setSelectedId(null)}><ArrowLeft size={13}/>全部镜头</Button>}
                <span>{shots.length} 个镜头</span><span>·</span><span>{video ? `${shots.reduce((sum,shot)=>sum+(parseFloat(shot.duration)||0),0)} 秒` : '图片分镜'}</span>
            </div>
            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={onAdd}><Plus size={13}/>添加镜头</Button>
        </div>
        <div className={selected ? 'storyboard-filmstrip' : 'storyboard-overview'} aria-label="分镜总览">
            {shots.map((shot,index)=>{
                const thumb=outputImage(shot)||shot.image_url;
                const hasOutput=video ? Boolean(shot.output_url||shot.video_url) : Boolean(outputImage(shot)||shot.output_url);
                return <Button variant="ghost" type="button" key={shot.id} aria-label={`编辑镜头 ${index+1}：${shot.title || '未命名镜头'}`} aria-pressed={selectedId===shot.id}
                    className="storyboard-shot block h-auto p-0 hover:bg-transparent" onClick={()=>choose(shot)}>
                    <div className="storyboard-shot__image">
                        {video && hasOutput ? <VideoComponent src={shot.output_url||shot.video_url} muted preload="metadata" className="h-full w-full object-contain" />
                            : thumb || (!video && shot.output_url) ? <ImageComponent src={thumb||shot.output_url} alt="" className="h-full w-full object-contain"/>
                            : <span className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground"><Image size={24} strokeWidth={1}/><span className="text-[11px]">{video?'添加首帧':'设计画面'}</span></span>}
                        <span className="storyboard-shot__number">{String(index+1).padStart(2,'0')}</span>
                        {video && <span className="storyboard-shot__duration">{parseFloat(shot.duration)||5}s</span>}
                    </div>
                    <div className="flex min-w-0 items-center justify-between gap-2 pt-2 text-xs"><span className="truncate">{shot.title||`镜头 ${String(index+1).padStart(2,'0')}`}</span>{shot.outputEnabled&&<Check size={12}/>}</div>
                    <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">{shot.status==='generating'&&<Loader2 size={10} className="animate-spin"/>}{stateLabel(shot)}{thumb&&!hasOutput&&' · 首帧'}</div>
                </Button>;
            })}
            {!shots.length && <Button type="button" variant="ghost" className="col-span-full h-40 flex-col gap-3 text-muted-foreground" onClick={onAdd}><Film size={26} strokeWidth={1}/>添加第一个镜头</Button>}
        </div>
        {selected && <section className="storyboard-shot-editor mt-4 rounded-2xl border border-border bg-card p-4" aria-label={`镜头 ${selectedIndex+1} 编辑`} data-storyboard-shot-key={`${encodeURIComponent(nodeId)}::${encodeURIComponent(selected.id)}`}>
            <div className="mb-4 flex items-center gap-2">
                <span className="text-xs tabular-nums text-muted-foreground">{String(selectedIndex+1).padStart(2,'0')}</span>
                <Input aria-label="镜头名称" value={selected.title||''} placeholder={`镜头 ${selectedIndex+1}`} onChange={event=>change({title:event.target.value})} className="h-8 flex-1 border-0 bg-transparent px-1 text-sm shadow-none"/>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={!selectedIndex} aria-label="上一镜" onClick={()=>choose(shots[selectedIndex-1])}><ArrowLeft size={14}/></Button>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={selectedIndex===shots.length-1} aria-label="下一镜" onClick={()=>choose(shots[selectedIndex+1])}><ArrowRight size={14}/></Button>
                <DropdownMenu modal={false}><DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label="镜头操作"><MoreHorizontal size={16}/></Button></DropdownMenuTrigger>
                    <DropdownMenuContent onClick={stop} onMouseDown={stop} onKeyDown={stop}>
                        <DropdownMenuItem disabled={!selectedIndex||running} onSelect={()=>onMove(selected.id,-1)}>前移镜头</DropdownMenuItem>
                        <DropdownMenuItem disabled={selectedIndex===shots.length-1||running} onSelect={()=>onMove(selected.id,1)}>后移镜头</DropdownMenuItem>
                        <DropdownMenuItem disabled={running} onSelect={()=>{onDelete(selected.id);setSelectedId(null);}}>删除镜头</DropdownMenuItem>
                    </DropdownMenuContent></DropdownMenu>
            </div>
            <div className="storyboard-shot-editor__body">
                <div className="min-w-0 space-y-2">
                    <div className="storyboard-stage relative flex items-center justify-center overflow-hidden rounded-xl bg-background/70" onDragOver={event=>event.preventDefault()} onDrop={event=>onDrop?.(event,selected.id)}>
                        {output ? video ? <VideoComponent src={output} controls className="h-full w-full object-contain"/> : <ImageComponent src={output} alt="分镜生成结果" className="h-full w-full object-contain"/>
                            : selected.image_url ? <ImageComponent src={selected.image_url} alt="首帧预览" className="h-full w-full object-contain"/> : <Image size={32} strokeWidth={1} className="text-muted-foreground/40"/>}
                        <span className="absolute left-2 top-2 rounded-md bg-background/80 px-2 py-1 text-[10px] text-muted-foreground">{output?'生成结果':selected.image_url?'首帧预览':'暂无画面'}</span>
                        {(output||selected.image_url) && <Button type="button" variant="secondary" size="icon" className="absolute right-2 top-2 h-7 w-7 rounded-lg" aria-label="预览当前镜头" onClick={()=>onPreview(output||selected.image_url,output&&video?'video':'image')}><Maximize2 size={13}/></Button>}
                    </div>
                    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground"><span>{stateLabel(selected)}</span>
                        {output && <Label className="flex items-center gap-1.5 text-xs"><Checkbox checked={Boolean(selected.outputEnabled)} onCheckedChange={checked=>change({outputEnabled:checked===true,...(!video&&checked===true&&!(selected.selectedImageIndex>=0)?{selectedImageIndex:0}:{})})}/>{video ? '选为输出' : '确认此画面'}</Label>}
                    </div>
                    {(selected.output_images?.length>1)&&<div className="flex gap-1">{selected.output_images.map((url,index)=><Button type="button" key={url} variant={selected.selectedImageIndex===index?'secondary':'ghost'} size="sm" aria-label={`选择结果 ${index+1}`} onClick={()=>change({selectedImageIndex:index})}>{index+1}</Button>)}</div>}
                    {selected.outputHistory?.length>1&&<div className="flex items-center gap-2"><Button type="button" variant="ghost" size="sm" onClick={()=>onHistory(selected.id,-1)}>上一版</Button><span className="text-xs text-muted-foreground">{(selected.outputHistoryCursor??selected.outputHistory.length-1)+1} / {selected.outputHistory.length}</span><Button type="button" variant="ghost" size="sm" onClick={()=>onHistory(selected.id,1)}>下一版</Button></div>}
                </div>
                <div className="flex min-w-0 flex-col gap-3">
                    <div className="flex items-center gap-2">{frame('image_url',video?'首帧':'参考图')}{selected.useFirstLastFrame&&frame('lastFrame','尾帧')}<span className="min-w-0 truncate text-xs text-muted-foreground">{selected.image_urlSource?.name||selected.image_filename||'选择画布图片作为参考'}</span></div>
                    {!video && referenceImages.length > 0 && <div className="flex flex-wrap items-center gap-2">{referenceImages.slice(1).map((url,index)=><div key={url} className="relative h-12 w-12 rounded-lg border border-border">
                        <ImageComponent src={url} alt={`参考图 ${index+2}`} className="h-full w-full rounded-lg object-cover"/>
                        <Button type="button" variant="secondary" size="icon" className="absolute -right-1 -top-1 h-5 w-5 rounded-full" aria-label={`移除参考图 ${index+2}`} onClick={()=>change({referenceImages:referenceImages.filter((_,i)=>i!==index+1)})}><X size={10}/></Button>
                    </div>)}{referenceImages.length<5&&<div className="storyboard-reference relative rounded-xl border border-border"><StoryboardFramePicker compact label="新增参考图" candidates={candidates} ImageComponent={ImageComponent}
                        onSelect={source=>change({image_url:referenceImages[0]||source.url,referenceImages:[...new Set([...referenceImages,source.url])]})}
                        onUpload={event=>{ const file=event.target.files?.[0]; if(!file)return;const id=selected.id,refs=referenceImages,reader=new FileReader();reader.onload=()=>onChange(id,{image_url:refs[0]||reader.result,referenceImages:[...refs,reader.result]});reader.readAsDataURL(file);event.target.value=''; }}/></div>}</div>}
                    <Textarea aria-label="镜头描述" value={selected.description||''} onChange={event=>change({description:event.target.value})} placeholder="镜头内容、对白与声音…" className="min-h-12 resize-none border-0 bg-transparent px-1 text-xs shadow-none"/>
                    <Textarea aria-label="镜头提示词" value={selected.prompt||''} onChange={event=>change({prompt:event.target.value})} placeholder="描述画面、人物动作与镜头运动…" className="min-h-28 flex-1 resize-y rounded-xl border-border/60 bg-background/30 text-sm leading-relaxed shadow-none"/>
                    {selected.frameBindingError && <p role="status" className="text-xs text-muted-foreground">{selected.frameBindingError}</p>}
                    {['failed','error','reconciling'].includes(selected.status)&&<p role={selected.status==='reconciling'?'status':'alert'} className="text-xs leading-relaxed text-destructive">{selected.errorMsg||stateLabel(selected)}</p>}
                    <div className="flex flex-wrap items-center gap-1 border-t border-border/60 pt-2">
                        <GenerationModelPicker models={models} kind={mode} value={selected.model} label={`镜头 ${selectedIndex+1} 生成模型`} onChange={key=>change(modelSelectionPatch(models.find(m=>modelKey(m)===key),selected))}/>
                        <Popover><PopoverTrigger asChild><Button type="button" variant="ghost" className="h-9 gap-1.5 px-2 text-xs" aria-label="镜头规格"><Scan size={14}/>{specs.map(spec=>spec.kind==='ratio'&&inheritedRatio?'跟随首帧':spec.kind==='duration'?`${parseFloat(spec.value)||5}s`:spec.value).filter(Boolean).join(' · ')||'规格'}</Button></PopoverTrigger>
                            <GenerationPopover aria-label="镜头规格" className="space-y-4">
                                {specs.map(spec=>spec.kind==='ratio'&&inheritedRatio?<p key="ratio" className="text-xs text-muted-foreground">比例跟随首帧</p>:spec.options.length>0?<GenerationOptions key={spec.kind} label={{ratio:'比例',resolution:'画质',duration:'时长'}[spec.kind]} value={String(spec.value).replace(spec.kind==='duration'?/s$/i:/$^/,'')} values={spec.options} ratios={spec.kind==='ratio'} formatValue={value=>spec.kind==='duration'?`${String(value).replace(/s$/i,'')}s`:value} onChange={value=>patchSpec(spec,value)}/>:null)}
                                {video&&(model?.supportsFirstLastFrame||model?.inputs?.frames)&&<Label className="flex items-center gap-2 text-xs"><Checkbox checked={Boolean(selected.useFirstLastFrame)} onCheckedChange={value=>change({useFirstLastFrame:value===true})}/>使用首尾帧</Label>}
                                <ModelParameterFields fields={extraFields} values={selected.customParams||{}} immersive onChange={customParams=>change({customParams})}/>
                            </GenerationPopover>
                        </Popover>
                        <Button type="button" size="icon" className="ml-auto h-9 w-9 rounded-full shadow-none" disabled={running||Boolean(selected.frameBindingError)||!model||!(selected.prompt||selected.description)?.trim()} aria-label={running?'正在生成':`生成${video?'视频':'图片'}`} onClick={()=>onRun(selected)}>{running?<Loader2 size={16} className="animate-spin"/>:<ArrowUp size={17}/>}</Button>
                    </div>
                </div>
            </div>
        </section>}
    </div>;
}
