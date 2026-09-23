import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { NativeSelect } from '@/components/ui/native-select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { requiresTaskReconciliation } from '@/lib/task-state';

export const money = value => value == null ? '待核算' : `¥${Number(value).toLocaleString('zh-CN', {maximumFractionDigits: 6})}`;
export const date = value => value ? new Date(value * 1000).toLocaleString('zh-CN') : '—';
export const operations = {'text.generate':'文本生成','image.generate':'文生图','image.edit':'图片生成与编辑','video.generate':'视频生成','audio.generate':'音频生成','video.edit':'视频编辑','video.extend':'视频延长','video.retake':'视频重拍','video.replace':'对象替换','video.remove':'对象移除','video.avatar':'数字人','image.upscale':'图像增强','image.remove_background':'去除背景','image.relight':'打光','image.expand':'扩图','image.inpaint':'局部重绘','image.angles':'多角度','image.skin':'肤质优化','image.erase':'擦除','model.generate':'3D 生成'};
export const statuses = {queued:'排队中',submitting:'提交中',running:'生成中',reconciling:'核对中',succeeded:'已完成',partially_succeeded:'部分完成',failed:'失败',canceled:'已取消'};
export const taskStatusLabel = task => requiresTaskReconciliation(task) ? '待人工核对' : statuses[task.status] || task.status;
export const meters = {input_tokens:'输入 Token',output_tokens:'输出 Token',cache_read_tokens:'缓存读取 Token',cache_write_tokens:'缓存写入 Token',images:'图片',images_small:'图片 ≤261万像素',images_large:'图片 >261万像素',billable_input_images:'参考图（首张免费）',megapixels:'百万像素',video_seconds:'视频秒数',audio_seconds:'音频秒数',input_audio_seconds:'输入音频秒数',input_video_seconds:'输入视频秒数',characters:'字符数',requests:'调用次数',image_tokens:'图片 Token'};
export const editableModel = ({id,created_at,...model}) => model;
export const priceState = price => !price.published_at ? '草稿' : price.published_at > Date.now()/1000 ? '待生效' : '已发布';
export function currentPrice(prices, id, kind) {
    return prices.filter(p=>p.offering_id===id && p.kind===kind && p.published_at && p.published_at<=Date.now()/1000).sort((a,b)=>b.published_at-a.published_at)[0];
}

export function StatusBadge({children,active=false}) {
    return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-1 text-xs ${active?'bg-foreground/10 text-foreground':'bg-muted text-muted-foreground'}`}><span className={`h-1.5 w-1.5 rounded-full ${active?'bg-emerald-500':'bg-muted-foreground/50'}`} />{children}</span>;
}
export function DataTable({columns,rows,empty='暂无记录'}) {
    return <div className="overflow-x-auto rounded-xl border border-border"><Table><TableHeader><TableRow>{columns.map(c=><TableHead key={c.key} className="whitespace-nowrap bg-muted/40 px-4 text-xs">{c.title}</TableHead>)}</TableRow></TableHeader><TableBody>{rows.map(row=><TableRow key={row.id}>{columns.map(c=><TableCell key={c.key} className={`px-4 py-3.5 ${c.className||''}`}>{c.render?c.render(row):row[c.key]}</TableCell>)}</TableRow>)}{!rows.length&&<TableRow><TableCell colSpan={columns.length} className="h-40 text-center text-muted-foreground">{empty}</TableCell></TableRow>}</TableBody></Table></div>;
}

export function FormDialog({title,description,fields,initial={},onSave,onClose,submitLabel='保存'}) {
    const [error,setError]=useState(''),[busy,setBusy]=useState(false);
    return <Dialog open onOpenChange={open=>!open&&!busy&&onClose()}><DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto rounded-2xl"><DialogHeader><DialogTitle>{title}</DialogTitle>{description?<DialogDescription>{description}</DialogDescription>:<DialogDescription className="sr-only">填写并保存配置</DialogDescription>}</DialogHeader>
        <form className="space-y-5" onSubmit={async event=>{
            event.preventDefault();setBusy(true);setError('');
            try {
                const form=Object.fromEntries(new FormData(event.currentTarget));
                for(const field of fields){
                    if(field.disabled){form[field.name]=initial[field.name]??field.default;continue;}
                    if(field.type==='json')form[field.name]=JSON.parse(form[field.name]||'{}');
                    if(field.type==='number')form[field.name]=Number(form[field.name]);
                }
                await onSave(form);onClose();
            }catch(error){setError(error.message);}finally{setBusy(false);}
        }}><div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{fields.map(field=><Label key={field.name} className={`flex min-w-0 flex-col gap-2 ${field.type==='json'||field.wide?'sm:col-span-2':''}`}>{field.label}
            {field.type==='json'?<Textarea name={field.name} rows={field.rows||5} defaultValue={JSON.stringify(initial[field.name]??field.default??{},null,2)} className="font-mono text-xs" />
            :field.options?<NativeSelect name={field.name} disabled={field.disabled} defaultValue={initial[field.name]??field.default??''} required={field.required!==false}>{field.options.map(o=><option key={o.value??o} value={o.value??o}>{o.label??o}</option>)}</NativeSelect>
            :<Input name={field.name} type={field.type||'text'} disabled={field.disabled} defaultValue={initial[field.name]??field.default??''} required={field.required!==false} min={field.min} max={field.max} minLength={field.minLength} />}
            {field.help&&<span className="text-xs font-normal leading-relaxed text-muted-foreground">{field.help}</span>}
        </Label>)}</div>{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}<div className="flex justify-end gap-2 border-t pt-4"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>取消</Button><Button type="submit" disabled={busy}>{busy?'保存中…':submitLabel}</Button></div></form>
    </DialogContent></Dialog>;
}
