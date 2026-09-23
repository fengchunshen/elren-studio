import { GenerationModelPicker } from './generation-model-picker';
import { modelSelectionPatch } from '@/lib/generation-models';
import { ImageSpatialControls } from './image-spatial-controls';
import { ModelParameterFields } from './model-parameter-fields';
import React, { useState } from 'react';
import { Crop, Expand, Eraser, Maximize2, Scissors, Palette, Sun, Rotate3D, MoreHorizontal, Paintbrush, Download, FolderPlus, Scan, Scaling } from 'lucide-react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { NodeInspector } from './node-frame';
import { useOverlaysSuspended } from '@/components/ui/overlay-suspension';

export const IMAGE_OPERATIONS = {
    crop: { name: '裁剪', fields: [['x', '左边距', 0], ['y', '上边距', 0], ['width', '宽度', 512], ['height', '高度', 512]] },
    resize: { name: '调整像素', fields: [['width', '宽度', 1024], ['height', '高度', 1024]] },
    split: { name: '快速切分', fields: [] },
    upscale: { name: '高清放大', operation: 'image.upscale', fields: [['scale', '倍率', 2]] },
    remove_background: { name: '抠图', operation: 'image.remove_background', fields: [] },
    expand: { name: '扩图', operation: 'image.expand', fields: [['width', '目标宽度', 1024], ['height', '目标高度', 1024]] },
    relight: { name: '打光', operation: 'image.relight', fields: [['azimuth', '光源方向', 0], ['elevation', '光源高度', 45], ['intensity', '亮度', 1], ['temperature', '色温', 6500]] },
    angles: { name: '多角度', operation: 'image.angles', fields: [['yaw', '水平角度', 0], ['pitch', '垂直角度', 0], ['zoom', '远近', 1]] },
    skin: { name: '皮肤编辑', operation: 'image.skin', fields: [['strength', '强度', 0.5]] },
    erase: { name: '擦除', operation: 'image.erase', fields: [] },
    inpaint: { name: '局部重绘', operation: 'image.inpaint', fields: [] },
};
export function ImageToolbar({ onAction, onDownload, onSave, onPreview, available = [] }) {
    const suspended = useOverlaysSuspended();
    const [busy, setBusy] = useState('');
    if (suspended) return null;
    const action = async (key, callback) => { if (busy) return; setBusy(key); try { await callback?.(); } catch (e) { toast.error(e.message); } finally { setBusy(''); } };
    const iconButton = (Icon, name, callback, disabled = false) => <Tooltip key={name}><TooltipTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" aria-label={name} disabled={disabled} onClick={callback}><Icon size={15} /></Button>
        </TooltipTrigger><TooltipContent>{name}</TooltipContent></Tooltip>;
    return <TooltipProvider delayDuration={350}><div data-image-toolbar className="absolute -top-20 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border bg-popover p-1 shadow-sm" onMouseDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}>
        {iconButton(Crop, '裁剪', () => onAction('crop'))}
        {available.includes('angles') && iconButton(Rotate3D, '多角度', () => onAction('angles'))}
        {available.includes('inpaint') && iconButton(Paintbrush, '局部重绘', () => onAction('inpaint'))}
        {available.includes('relight') && iconButton(Sun, '打光', () => onAction('relight'))}
        <DropdownMenu modal={false}><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" aria-label="更多图片工具"><MoreHorizontal size={15} /></Button></DropdownMenuTrigger>
            <DropdownMenuContent side="bottom" align="center">
                {[[Expand, 'expand', '扩图'], [Eraser, 'erase', '擦除'], [Maximize2, 'upscale', '增强'], [Scaling, 'resize', '调整像素'], [Scissors, 'split', '切分'], [Palette, 'annotate', '标注']].filter(([,key]) => ['resize','split','annotate'].includes(key) || available.includes(key)).map(([Icon,key,name]) => <DropdownMenuItem key={key} onSelect={() => onAction(key)}><Icon size={15} />{name}</DropdownMenuItem>)}
                {available.includes('remove_background') && <DropdownMenuItem onSelect={() => onAction('remove_background')}>抠图</DropdownMenuItem>}
            </DropdownMenuContent>
        </DropdownMenu>
        <span className="mx-1 h-4 w-px bg-border" />
        {iconButton(FolderPlus, busy === 'save' ? '正在保存素材' : '保存到素材库', () => action('save', onSave), Boolean(busy))}
        {iconButton(Download, '下载图片', () => action('download', onDownload), Boolean(busy))}
        {iconButton(Scan, '全屏查看', onPreview)}
    </div></TooltipProvider>;
}
export function ImageProcessInspector({ node, source, models, onChange, onRun, onMask, resolveUrl }) {
    const [busy, setBusy] = useState(false), [error, setError] = useState('');
    const settings = node.settings || {}, key = settings.imageOperation || 'crop', operation = IMAGE_OPERATIONS[key];
    const supported = models.filter(item => item.platformOperation === operation.operation);
    const selected = supported.some(item => item.id === settings.model);
    return <NodeInspector label="图片处理设置">
        <NativeSelect aria-label="图片处理方式" value={key} onChange={event => { onChange({ imageOperation: event.target.value, model: '' }); setError(''); }}>{Object.entries(IMAGE_OPERATIONS).map(([value, item]) => <option key={value} value={value}>{item.name}</option>)}</NativeSelect>
        {['crop', 'expand', 'angles', 'relight'].includes(key) && <ImageSpatialControls key={key} source={source} operation={key} settings={settings} onChange={onChange} resolveUrl={resolveUrl} />}
        <div className="mt-3 grid grid-cols-2 gap-2">{operation.fields.map(([name, label, fallback]) => <Label key={name} className="space-y-1 text-xs"><span>{label}</span><Input type="number" aria-label={label} value={settings[name] ?? fallback} onChange={event => onChange({ [name]: Number(event.target.value) })} /></Label>)}</div>
        {key === 'split' && <NativeSelect aria-label="切分规格" value={settings.grid || 3} onChange={event => onChange({ grid: Number(event.target.value) })} className="mt-3">{[2, 3, 4].map(n => <option key={n} value={n}>{n}×{n}</option>)}</NativeSelect>}
        {operation.operation && <><GenerationModelPicker kind="image" label="图片处理模型" models={supported} value={settings.model} onChange={key => onChange(modelSelectionPatch(supported.find(item => item.id === key), settings))} />
            <Textarea aria-label="图片修改要求" placeholder="描述需要处理的内容…" value={settings.prompt || ''} onChange={event => onChange({ prompt: event.target.value })} className="mt-2 min-h-16" /></>}
        <div className="mt-2 space-y-2"><ModelParameterFields fields={supported.find(item => item.id === settings.model)?.customParams?.filter(field => !operation.fields.some(([name]) => name === field.name) && !(key === 'upscale' && ['output_width', 'output_height'].includes(field.name)))} values={settings.customParams} onChange={customParams => onChange({ customParams })} /></div>
        {['erase', 'inpaint'].includes(key) && <Button variant="outline" size="sm" className="mt-2" onClick={onMask}>编辑源图蒙版</Button>}
        {!source && <p className="mt-2 text-xs text-muted-foreground">请连接一张图片。</p>}
        {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
        <Button className="mt-3 w-full" disabled={busy || !source || (operation.operation && !selected)} onClick={async () => { setBusy(true); setError(''); try { await onRun(key, operation); } catch (e) { setError(e.message); } finally { setBusy(false); } }}>{busy ? '处理中…' : operation.name}</Button>
    </NodeInspector>;
}
