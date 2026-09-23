import React,{useEffect,useState} from 'react';
import {LayoutGrid,History,UserRound,LogOut,ShieldCheck} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {NativeSelect} from '@/components/ui/native-select';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuItem,DropdownMenuSeparator} from '@/components/ui/dropdown-menu';
import {api} from '@/services/apiClient';
import {DataTable,date,money,taskStatusLabel} from './platform-ui';

export function CreatorAccountMenu({user,onOpen,onWorkspace,onAdmin,onLogout,placement='sidebar'}) {
    return <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={`账号菜单：${user.username}`} className={`${placement==='sidebar'?'mt-1':''} h-9 w-9 shrink-0 rounded-full border border-border bg-muted text-sm font-medium`}>{user.username.slice(0,1).toUpperCase()}</Button></DropdownMenuTrigger>
        <DropdownMenuContent side={placement==='header'?'bottom':'right'} align="end" sideOffset={12} className="w-64 rounded-2xl p-2">
            <div className="px-3 py-3"><p className="text-sm font-medium">{user.username}</p><p className="mt-1 text-xs text-muted-foreground">{user.role==='admin'?'管理员账号':'个人工作空间'}</p></div><DropdownMenuSeparator/>
            <DropdownMenuItem className="rounded-lg" onSelect={onWorkspace}><LayoutGrid size={15}/>工作空间</DropdownMenuItem>
            <DropdownMenuItem className="rounded-lg" onSelect={()=>onOpen('usage')}><History size={15}/>使用记录</DropdownMenuItem>
            <DropdownMenuItem className="rounded-lg" onSelect={()=>onOpen('account')}><UserRound size={15}/>账户管理</DropdownMenuItem>
            {user.role==='admin'&&<><DropdownMenuSeparator/><DropdownMenuItem className="rounded-lg" onSelect={onAdmin}><ShieldCheck size={15}/>管理后台</DropdownMenuItem></>}
            <DropdownMenuSeparator/><DropdownMenuItem className="rounded-lg" onSelect={onLogout}><LogOut size={15}/>退出登录</DropdownMenuItem>
        </DropdownMenuContent>
    </DropdownMenu>;
}

export function CreatorPanel({kind,user,projects,onClose}) {
    const [data,setData]=useState(null),[projectId,setProjectId]=useState(''),[error,setError]=useState(''),[changing,setChanging]=useState(false),[busy,setBusy]=useState(false);
    useEffect(()=>{
        if(kind!=='usage')return;
        let active=true;setData(null);setError('');
        api(`/usage/records?project_id=${encodeURIComponent(projectId)}`).then(result=>active&&setData(result)).catch(e=>active&&setError(e.message));
        return()=>{active=false;};
    },[kind,projectId]);
    if(!['account','usage'].includes(kind))return null;
    return <Dialog open onOpenChange={open=>!open&&onClose()}><DialogContent className={`max-h-[80vh] overflow-y-auto rounded-2xl ${kind==='usage'?'max-w-3xl':'max-w-md'}`}><DialogHeader><DialogTitle>{kind==='usage'?'使用记录':'账户管理'}</DialogTitle><DialogDescription>{kind==='usage'?'查看你的生成状态和使用费用。':'管理当前登录账号。'}</DialogDescription></DialogHeader>
        {kind==='account'?<><dl className="space-y-4 py-3 text-sm"><div className="flex justify-between"><dt className="text-muted-foreground">账号</dt><dd>{user.username}</dd></div><div className="flex justify-between"><dt className="text-muted-foreground">工作空间</dt><dd>个人</dd></div><div className="flex justify-between"><dt className="text-muted-foreground">账号状态</dt><dd>正常</dd></div></dl>
            {changing?<form className="space-y-4 border-t pt-4" onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{const body=Object.fromEntries(new FormData(e.currentTarget));await api('/auth/change-password',{method:'POST',body});window.location.reload();}catch(e){setError(e.message);}finally{setBusy(false);}}}><Label className="flex flex-col gap-2">当前密码<Input name="current_password" type="password" autoComplete="current-password" required/></Label><Label className="flex flex-col gap-2">新密码<Input name="password" type="password" autoComplete="new-password" minLength={12} required/></Label><p className="text-xs text-muted-foreground">至少 12 位。修改后需要重新登录。</p>{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}<Button disabled={busy} type="submit">{busy?'保存中…':'保存密码'}</Button></form>:<Button variant="outline" onClick={()=>setChanging(true)}>修改密码</Button>}
        </>:<>
            <NativeSelect aria-label="项目筛选" value={projectId} onChange={e=>setProjectId(e.target.value)}><option value="">全部项目</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</NativeSelect>
            {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}{!data&&!error?<p role="status" className="py-8 text-center text-muted-foreground">正在加载…</p>:<DataTable rows={data?.items||[]} empty="暂无使用记录" columns={[{key:'created_at',title:'时间',render:r=>date(r.created_at)},{key:'model_name',title:'模型'},{key:'status',title:'状态',render:r=>taskStatusLabel(r)},{key:'amount',title:'费用',render:r=>money(r.billing.amount)}]}/>}
            {data?.next_cursor&&<Button variant="outline" onClick={async()=>{try{const next=await api(`/usage/records?project_id=${encodeURIComponent(projectId)}&cursor=${data.next_cursor}`);setData(old=>({...next,items:[...old.items,...next.items]}));}catch(e){setError(e.message);}}}>加载更多</Button>}
        </>}
    </DialogContent></Dialog>;
}
