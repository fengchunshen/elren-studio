import React,{useEffect,useState} from 'react';
import {Boxes, Cable, Coins, Users, BarChart3, ScrollText, ArrowLeft, Plus, Search, RefreshCw} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {NativeSelect} from '@/components/ui/native-select';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {ElrenBrand} from '@/components/brand/elren-brand';
import {api} from '@/services/apiClient';
import {toast} from 'sonner';
import ChannelDialog, {editableChannel} from './ChannelDialog';
import {DataTable,FormDialog,StatusBadge,operations,meters,taskStatusLabel,date,money,currentPrice,priceState,editableModel} from './platform-ui';

const sections=[['models','模型管理',Boxes],['channels','渠道管理',Cable],['prices','价格管理',Coins],['users','用户管理',Users],['accounting','用量与成本',BarChart3],['audit','操作记录',ScrollText]];
const endpoints={models:'/admin/models',channels:'/admin/channels',prices:'/admin/price-versions',users:'/admin/users',accounting:'/admin/usage/records',audit:'/admin/audit-events'};
const adapterOptions=['openai_chat','openai_image','openai_image_edit','json_async','http_media','minimax_h3'];
const kindOptions=[{value:'',label:'全部能力'},...Object.entries(operations).map(([value,label])=>({value,label}))];

export default function AdminWorkspace({user,path,navigate,onLogout}) {
    const requested=path.split('/')[2], page=sections.some(s=>s[0]===requested)?requested:'models';
    const [data,setData]=useState(null),[models,setModels]=useState([]),[channels,setChannels]=useState([]),[prices,setPrices]=useState([]);
    const [query,setQuery]=useState(''),[operation,setOperation]=useState(''),[state,setState]=useState('all');
    const [error,setError]=useState(''),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0),[form,setForm]=useState(null),[detail,setDetail]=useState(null);
    const [presets,setPresets]=useState(null),[presetQuery,setPresetQuery]=useState('');
    const [channelForm,setChannelForm]=useState(null);
    const refresh=()=>setRevision(x=>x+1);
    useEffect(()=>{setQuery('');setState('all');setOperation('');setForm(null);setDetail(null);setPresets(null);setChannelForm(null);},[page]);
    useEffect(()=>{
        if(user.role!=='admin')return;
        let active=true;setData(null);setError('');
        Promise.all([api(endpoints[page]),api('/admin/models'),api('/admin/channels'),api('/admin/price-versions'),page==='accounting'?api('/admin/usage/summary'):Promise.resolve(null)])
            .then(([result,m,c,p,summary])=>{if(active){setData({...result,summary});setModels(m.items);setChannels(c.items);setPrices(p.items);}})
            .catch(e=>active&&setError(e.message));
        return()=>{active=false;};
    },[page,revision,user.role]);
    async function act(action){setBusy(true);setError('');try{await action();refresh();}catch(e){setError(e.message);}finally{setBusy(false);}}
    const modelName=id=>models.find(m=>m.id===id)?.name||'未知模型';
    const channelName=id=>channels.find(c=>c.id===id)?.name||'未配置渠道';
    const ready=m=>channels.some(c=>c.id===m.channel_id&&c.active)&&currentPrice(prices,m.id,'cost')&&currentPrice(prices,m.id,'sale');
    const modelFields=editing=>[
        {name:'name',label:'显示名称',wide:true},
        {name:'channel_id',label:'模型渠道',options:channels.map(c=>({value:c.id,label:c.name})),disabled:editing},
        {name:'operation',label:'模型能力',options:kindOptions.slice(1),disabled:editing},
        {name:'upstream_model',label:'供应商模型 ID',disabled:editing},
        {name:'adapter',label:'接口协议',options:adapterOptions},
        {name:'parameters',label:'生成参数',type:'json',default:{},help:'允许用户选择的规格及默认值。'},
        {name:'config',label:'接口映射',type:'json',default:{},help:'请求路径、任务查询、结果与用量映射；凭据在渠道中统一管理。'}];
    const priceFields=[{name:'offering_id',label:'模型',options:models.map(m=>({value:m.id,label:m.name}))},
        {name:'kind',label:'价格类型',options:[{value:'sale',label:'用户售价'},{value:'cost',label:'渠道成本'}]},
        {name:'currency',label:'原始币种',options:['CNY','USD','EUR'],default:'CNY'},
        {name:'fx',label:'兑人民币汇率',default:'1'},{name:'markup',label:'加价比例',default:'0',help:'0 表示不加价；成本价固定为 0。'},
        {name:'source',label:'价格依据',wide:true},
        {name:'components',label:'计费项目',type:'json',default:[{meter:'images',unit_size:'1',unit_price:''}],help:'已发布版本不可覆盖；新价格单独建立版本。'}];
    const newForm=()=>{
        if(page==='models')setForm({title:'新增模型',fields:modelFields(false),initial:{channel_id:channels[0]?.id,operation:'image.generate',adapter:'openai_image'},save:body=>api('/admin/models',{method:'POST',body})});
        if(page==='channels')setChannelForm({channel:null});
        if(page==='prices')setForm({title:'新增价格版本',fields:priceFields,save:body=>api('/admin/price-versions',{method:'POST',body})});
        if(page==='users')setForm({title:'创建用户',fields:[{name:'username',label:'账号'},{name:'password',label:'初始密码',type:'password',minLength:12,help:'至少 12 位；首次登录需要修改。'},{name:'role',label:'角色',options:[{value:'user',label:'普通用户'},{value:'admin',label:'管理员'}],default:'user'}],save:body=>api('/admin/users',{method:'POST',body})});
    };
    const editModel=m=>setForm({title:'编辑模型',fields:modelFields(true),initial:m,save:body=>api(`/admin/models/${m.id}`,{method:'PATCH',body:{...editableModel(m),...body}})});
    const columns=page==='models'?[
        {key:'name',title:'模型',render:m=><div className="min-w-[180px]"><span className="font-medium">{m.name}</span><div className="mt-1 flex gap-1 text-xs text-muted-foreground">{[...(m.parameters.resolution?.enum||m.parameters.size?.enum||[]),...(m.config.content_from_frames?['首尾帧']:[])].map(t=><span key={t} className="rounded bg-muted px-1.5 py-0.5">{t}</span>)}</div></div>},
        {key:'operation',title:'能力',render:m=>operations[m.operation]||m.operation},
        {key:'channel',title:'渠道',render:m=>channelName(m.channel_id)},
        {key:'state',title:'状态',render:m=><StatusBadge active={m.active&&!!ready(m)}>{m.active&&ready(m)?'已开放':m.active?'未就绪':'未开放'}</StatusBadge>},
        {key:'price',title:'价格配置',render:m=><span className="text-xs text-muted-foreground">{currentPrice(prices,m.id,'sale')&&currentPrice(prices,m.id,'cost')?'成本 / 售价已配置':'待配置价格'}</span>},
        {key:'actions',title:'操作',render:m=><div className="flex gap-1"><Button size="sm" variant="ghost" onClick={()=>editModel(m)}>编辑</Button><Button size="sm" variant="ghost" disabled={busy||(!m.active&&!ready(m))} onClick={()=>act(()=>api(`/admin/models/${m.id}`,{method:'PATCH',body:{...editableModel(m),active:!m.active}}))}>{m.active?'停用':'开放'}</Button></div>}]
        :page==='channels'?[
            {key:'name',title:'渠道',render:c=><div><span className="font-medium">{c.name}</span><p className="mt-1 text-xs text-muted-foreground">{c.base_url}</p></div>},
            {key:'credential',title:'API Key',render:c=><span className="text-xs text-muted-foreground">{c.credential_configured?'•••••••• 已配置':'未配置'}</span>},
            {key:'concurrency',title:'并发'},
            {key:'state',title:'状态',render:c=><StatusBadge active={c.active}>{c.active?'启用':'停用'}</StatusBadge>},
            {key:'actions',title:'操作',render:c=><div className="flex gap-1"><Button size="sm" variant="ghost" onClick={()=>setChannelForm({channel:c})}>编辑</Button><Button size="sm" variant="ghost" disabled={busy} onClick={()=>act(()=>api(`/admin/channels/${c.id}`,{method:'PATCH',body:{...editableChannel(c),active:!c.active}}))}>{c.active?'停用':'启用'}</Button></div>}]
        :page==='prices'?[
            {key:'model',title:'模型',render:p=>modelName(p.offering_id)},
            {key:'kind',title:'类型',render:p=>p.kind==='cost'?'渠道成本':'用户售价'},
            {key:'components',title:'计费标准',render:p=><div className="space-y-1 text-xs">{p.components.map(c=><p key={c.meter}>{c.time_rule ? `高峰 ${c.unit_price} / 空闲 ${c.off_peak_unit_price}` : c.unit_price} {p.currency} / {Number(c.unit_size).toLocaleString()} {meters[c.meter]||c.meter}</p>)}{Number(p.markup)>0&&<p>加价 {Number(p.markup)*100}%</p>}</div>},
            {key:'state',title:'版本状态',render:p=><StatusBadge active={priceState(p)==='已发布'}>{priceState(p)}</StatusBadge>},
            {key:'time',title:'生效时间',render:p=>date(p.published_at)},
            {key:'actions',title:'操作',render:p=><div className="flex gap-1"><Button size="sm" variant="ghost" onClick={()=>setDetail({title:'价格依据',kind:'price',value:p})}>详情</Button>{!p.published_at&&<Button size="sm" variant="ghost" disabled={busy} onClick={()=>act(()=>api(`/admin/price-versions/${p.id}/publish`,{method:'POST'}))}>发布</Button>}</div>}]
        :page==='users'?[
            {key:'username',title:'账号',className:'font-medium'},
            {key:'role',title:'角色',render:u=>u.role==='admin'?'管理员':'普通用户'},
            {key:'active',title:'状态',render:u=><StatusBadge active={u.active}>{u.active?'启用':'停用'}</StatusBadge>},
            {key:'password',title:'首次登录',render:u=>u.must_change_password?'待修改密码':'已就绪'},
            {key:'actions',title:'操作',render:u=><div className="flex gap-1"><Button size="sm" variant="ghost" disabled={busy||u.id===user.id} onClick={()=>act(()=>api(`/admin/users/${u.id}`,{method:'PATCH',body:{active:!u.active}}))}>{u.active?'停用':'启用'}</Button><Button size="sm" variant="ghost" disabled={busy||u.id===user.id} onClick={()=>setDetail({title:'重置用户密码',kind:'reset',value:u})}>重置密码</Button></div>}]
        :page==='accounting'?[
            {key:'time',title:'时间',render:t=>date(t.created_at)}, {key:'model_name',title:'模型'},
            {key:'status',title:'任务状态',render:t=>taskStatusLabel(t)},
            {key:'sale',title:'用户费用',render:t=>money(t.billing.amount)}, {key:'cost',title:'渠道成本',render:t=>t.cost_status==='pending'?'待核算':money(t.cost_amount)},
            {key:'actions',title:'操作',render:t=><Button size="sm" variant="ghost" onClick={()=>setDetail({title:'任务明细',kind:'task',value:t})}>查看</Button>}]
        :[{key:'time',title:'时间',render:a=>date(a.created_at)},{key:'action',title:'操作'},{key:'target',title:'对象',className:'font-mono text-xs'},{key:'actions',title:'详情',render:a=><Button size="sm" variant="ghost" onClick={()=>setDetail({title:'操作记录',kind:'audit',value:a})}>查看</Button>}];
    const rows=(data?.items||[]).filter(row=>{
        const haystack=[row.name,row.username,row.model_name,row.action,modelName(row.offering_id),channelName(row.channel_id),row.upstream_model].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(query.toLowerCase())&&(!operation||row.operation===operation)&&(state==='all'||(state==='active'?row.active:!row.active));
    });
    if(user.role!=='admin')return null;
    const title=sections.find(s=>s[0]===page)[1];
    return <div className="admin-workspace min-h-screen bg-background text-foreground">
        <aside className="admin-sidebar"><div className="px-4 py-6"><ElrenBrand/><p className="mt-3 text-xs text-muted-foreground">管理控制台</p></div><nav aria-label="后台导航" className="space-y-1 px-2">{sections.map(([key,label,Icon])=><Button key={key} variant={page===key?'secondary':'ghost'} className="h-10 w-full justify-start rounded-lg px-3" aria-current={page===key?'page':undefined} onClick={()=>navigate(`/admin/${key}`)}><Icon size={17}/>{label}</Button>)}</nav><div className="mt-auto border-t p-3"><Button variant="ghost" className="w-full justify-start" onClick={()=>navigate('/')}><ArrowLeft size={16}/>返回创作空间</Button></div></aside>
        <div className="admin-main"><header className="admin-topbar"><span className="text-sm text-muted-foreground">管理控制台 / <span className="text-foreground">{title}</span></span><div className="flex items-center gap-3 text-sm"><span>{user.username}</span><span className="rounded border px-2 py-1 text-xs text-muted-foreground">管理员</span><Button size="sm" variant="ghost" onClick={onLogout}>退出</Button></div></header>
            <main className="mx-auto w-full max-w-[1500px] p-5 sm:p-8"><div className="mb-6 flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-semibold tracking-tight">{title}</h1><p className="mt-2 text-sm text-muted-foreground">{{models:'统一管理创作模型的能力、渠道与开放状态。',channels:'管理供应商连接、API Key 与渠道状态。',prices:'按版本维护渠道成本与用户售价。',users:'管理创作账号及访问权限。',accounting:'核对模型任务用量、用户费用与渠道成本。',audit:'查看管理操作及变更记录。'}[page]}</p></div><div className="flex gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={refresh}><RefreshCw size={14}/>刷新</Button>{page==='models'&&<Button size="sm" variant="outline" disabled={busy} onClick={()=>act(async()=>{const result=await api('/admin/model-presets');setPresets(result.items);setPresetQuery('');})}><Boxes size={15}/>从预设添加</Button>}{['models','channels','prices','users'].includes(page)&&<Button size="sm" onClick={newForm}><Plus size={15}/>{{models:'新增模型',channels:'新增渠道',prices:'新增价格',users:'创建用户'}[page]}</Button>}</div></div>
                {page==='models'&&data&&<div className="mb-5 flex flex-wrap gap-6 text-sm text-muted-foreground"><span>全部模型 <b className="ml-1 text-foreground">{data.items.length}</b></span><span>已开放 <b className="ml-1 text-foreground">{data.items.filter(m=>m.active&&ready(m)).length}</b></span><span>待配置 <b className="ml-1 text-foreground">{data.items.filter(m=>!ready(m)).length}</b></span></div>}
                {data?.summary&&<div className="mb-5 flex flex-wrap gap-8 rounded-xl border p-5">{[['用户费用',money(data.summary.recorded_amount)],['渠道成本',money(data.summary.cost_amount)],['待核算',`${data.summary.pending_count} 项`],['差额',data.summary.incomplete?'待核算':money(data.summary.difference)]].map(([label,value])=><div key={label}><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-xl font-medium">{value}</p></div>)}</div>}
                <div className="mb-4 flex flex-wrap gap-2"><div className="relative w-full sm:w-72"><Search size={15} className="absolute left-3 top-3 text-muted-foreground"/><Input aria-label={`搜索${title}`} placeholder={`搜索${title.replace('管理','')}…`} value={query} onChange={e=>setQuery(e.target.value)} className="pl-9"/></div>{page==='models'&&<NativeSelect aria-label="筛选模型能力" value={operation} onChange={e=>setOperation(e.target.value)}>{kindOptions.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</NativeSelect>}{['models','channels','users'].includes(page)&&<NativeSelect aria-label="筛选开放状态" value={state} onChange={e=>setState(e.target.value)}><option value="all">全部状态</option><option value="active">启用</option><option value="inactive">停用</option></NativeSelect>}</div>
                {error&&<p role="alert" className="mb-4 rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{error}</p>}{!data&&!error?<p role="status" className="py-16 text-center text-sm text-muted-foreground">正在加载{title}…</p>:<DataTable columns={columns} rows={rows} empty={query?'没有匹配的记录':'暂无记录'}/>}
                {data?.next_cursor&&<Button variant="outline" size="sm" className="mt-4" disabled={busy} onClick={async()=>{setBusy(true);try{const next=await api(`${endpoints[page]}?cursor=${data.next_cursor}`);setData(old=>({...old,items:[...old.items,...next.items],next_cursor:next.next_cursor}));}catch(e){setError(e.message);}finally{setBusy(false);}}}>加载更多</Button>}
            </main></div>
        {channelForm&&<ChannelDialog channel={channelForm.channel} onClose={()=>setChannelForm(null)} onSaved={()=>{refresh();toast.success('渠道已保存');}}/>}
        {form&&<FormDialog key={form.title+form.initial?.id} title={form.title} fields={form.fields} initial={form.initial} onClose={()=>setForm(null)} onSave={async body=>{await form.save(body);refresh();}}/>}
        {presets&&<Dialog open onOpenChange={open=>!open&&setPresets(null)}><DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto rounded-2xl"><DialogHeader><DialogTitle>从预设添加模型</DialogTitle><DialogDescription>添加后保存为草稿，在后台核对渠道及价格后开放。</DialogDescription></DialogHeader><Input aria-label="搜索模型预设" placeholder="搜索模型名称…" value={presetQuery} onChange={e=>setPresetQuery(e.target.value)}/><div className="divide-y">{presets.filter(p=>p.name.toLowerCase().includes(presetQuery.toLowerCase())).map(p=>{const imported=models.some(m=>m.config.preset_id===p.id);return <div key={p.id} className="flex items-center gap-4 py-3"><div className="min-w-0 flex-1"><p className="text-sm font-medium">{p.name}</p><p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{p.note}</p></div><Button size="sm" variant="outline" disabled={imported||busy} onClick={()=>act(()=>api(`/admin/model-presets/${p.id}`,{method:'POST'}))}>{imported?'已添加':'添加'}</Button></div>;})}</div></DialogContent></Dialog>}
        {detail&&<Dialog open onOpenChange={open=>!open&&setDetail(null)}><DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto rounded-2xl"><DialogHeader><DialogTitle>{detail.title}</DialogTitle><DialogDescription className="sr-only">管理详情</DialogDescription></DialogHeader>
            {detail.kind==='reset'?<><p className="text-sm">重置 {detail.value.username} 的密码后，其现有会话将失效。</p><Button onClick={()=>act(async()=>{const result=await api(`/admin/users/${detail.value.id}/reset-password`,{method:'POST'});setDetail({title:'临时密码',kind:'password',value:result.temporary_password});})} disabled={busy}>确认重置密码</Button></>:detail.kind==='password'?<><p className="text-sm text-muted-foreground">请妥善交给用户，首次登录需修改。</p><Input aria-label="临时密码" readOnly value={detail.value}/></>:detail.kind==='price'?<><p className="text-sm">{modelName(detail.value.offering_id)} · {detail.value.kind==='cost'?'渠道成本':'用户售价'} · {priceState(detail.value)}</p><p className="break-words text-sm text-muted-foreground">{detail.value.source}</p></>:<pre className="whitespace-pre-wrap break-all text-xs leading-relaxed">{JSON.stringify(detail.value,null,2)}</pre>}
        </DialogContent></Dialog>}
    </div>;
}
