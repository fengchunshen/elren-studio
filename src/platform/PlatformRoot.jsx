import React, {useEffect,useLayoutEffect,useState,lazy,Suspense} from 'react';
import {Label} from '@/components/ui/label';
import {Input} from '@/components/ui/input';
import {Button} from '@/components/ui/button';
import {Card} from '@/components/ui/card';
import {ElrenBrand} from '@/components/brand/elren-brand';
import {ElrenLoadingScreen} from '@/components/brand/elren-loader';
import {api,setCsrf} from '@/services/apiClient';
import {platformEnabled,setPlatformContext,getPlatformContext} from '@/services/platformContext';
import {Toaster} from '@/components/ui/sonner';
import {toast} from 'sonner';
import {WorkspaceHome} from '@/components/editor/workspace-home';
import {canvasProjectId} from '@/lib/project-route';
import {applyTheme,LAST_THEME_KEY} from '@/lib/theme';
import {openCanvasProject} from '@/services/workspaceProjects';
import {CreatorAccountMenu,CreatorPanel} from './CreatorAccount';
import './platform.css';

const Editor=lazy(()=>import('../App.jsx'));
const AdminWorkspace=lazy(()=>import('./AdminWorkspace'));

// The workspace page has no editor; it keeps the theme last chosen on a canvas.
function WorkspacePage({account,createOnOpen}) {
    const [theme]=useState(()=>{try{return window.localStorage.getItem(LAST_THEME_KEY)||'dark';}catch{return 'dark';}});
    useLayoutEffect(()=>applyTheme(theme),[theme]);
    return <><WorkspaceHome createOnOpen={createOnOpen} accountSlot={account} onOpen={openCanvasProject}/><Toaster theme={theme==='dark'?'dark':'light'} position="top-center" offset={80} closeButton/></>;
}

function AuthForm({ change, onDone }) {
    const [error, setError] = useState(''), [busy, setBusy] = useState(false);
    async function submit(event) {
        event.preventDefault(); setBusy(true); setError('');
        const form = Object.fromEntries(new FormData(event.currentTarget));
        try {
            if (change) { await api('/auth/change-password', {method: 'POST', body: form}); onDone(null); }
            else { const result = await api('/auth/login', {method: 'POST', body: form}); setCsrf(result.csrf_token); onDone(result.user); }
        } catch (error) { setError(error.message); }
        finally { setBusy(false); }
    }
    return <main className="platform-login"><Card className="platform-card"><form onSubmit={submit}>
        <ElrenBrand /><h1>{change ? '设置新密码' : '登录工作空间'}</h1>
        <p>{change ? '首次登录请修改管理员提供的初始密码。' : '使用你的账号继续创作。'}</p>
        {change ? <Label>当前密码<Input name="current_password" type="password" autoComplete="current-password" required /></Label>
            : <Label>账号<Input name="username" autoComplete="username" required /></Label>}
        <Label>{change ? '新密码（至少 12 位）' : '密码'}<Input name="password" type="password" autoComplete={change ? 'new-password' : 'current-password'} minLength={change ? 12 : 1} required /></Label>
        {error && <p role="alert" className="platform-error">{error}</p>}
        <Button className="w-full" type="submit" disabled={busy}>{busy ? '处理中…' : change ? '保存并重新登录' : '登录'}</Button>
    </form></Card></main>;
}


export default function PlatformRoot() {
    const [user,setUser]=useState(undefined),[ready,setReady]=useState(false),[error,setError]=useState('');
    const [projects,setProjects]=useState([]),[models,setModels]=useState([]),[tab,setTab]=useState(null);
    const [path,setPath]=useState(window.location.pathname),[missingProject,setMissingProject]=useState(false);
    const [createOnOpen]=useState(()=>new URLSearchParams(window.location.search).has('create'));
    const canvasId=canvasProjectId(path);
    const navigate=next=>{window.history.pushState({},'',next);setPath(next);setTab(null);};
    const isAdminPath=path==='/admin'||path.startsWith('/admin/');
    useEffect(()=>{
        window.__APP_BOOTED__=true;
        // Consume the one-shot create request so a refresh does not reopen the dialog.
        if(createOnOpen)window.history.replaceState(window.history.state,'',window.location.pathname);
        if(!platformEnabled)return;
        api('/auth/me').then(r=>{setCsrf(r.csrf_token);setUser(r.user);}).catch(e=>e.status===401?setUser(null):setError(e.message));
        const expired=()=>window.location.reload();
        // Canvas events may only open personal surfaces, never administration.
        const panel=e=>{if(['usage','account'].includes(e.detail))setTab(e.detail);};
        const pop=()=>{setPath(window.location.pathname);setTab(null);};
        window.addEventListener('platform:expired',expired);window.addEventListener('platform:panel',panel);window.addEventListener('popstate',pop);
        return()=>{window.removeEventListener('platform:expired',expired);window.removeEventListener('platform:panel',panel);window.removeEventListener('popstate',pop);};
    },[]);
    useEffect(()=>{
        if(!user||user.must_change_password)return;
        let canceled=false;setReady(false);
        Promise.all([api('/projects'),api('/models')]).then(([p,m])=>{
            if(canceled)return;
            // The canvas opens only the project named in its URL; a deleted or foreign project returns to the workspace.
            const project=canvasId&&p.items.find(i=>i.id===canvasId&&!i.archived)||null;
            if(canvasId&&!project){window.history.replaceState({},'','/');setPath('/');setMissingProject(true);}
            setPlatformContext({user,project,models:m.items});setProjects(p.items);setModels(m.items);setReady(true);
        }).catch(e=>!canceled&&setError(e.message));
        return()=>{canceled=true;};
    },[user]);
    useEffect(()=>{if(missingProject)toast.error('项目不存在或已删除');},[missingProject]);
    // Returning from administration refreshes only published creator models.
    useEffect(()=>{
        if(!ready||isAdminPath||!canvasId)return;
        let active=true;
        api('/models').then(r=>{if(active){setModels(r.items);setPlatformContext({...getPlatformContext(),models:r.items});}}).catch(e=>active&&setError(e.message));
        return()=>{active=false;};
    },[isAdminPath,ready,canvasId]);
    const logout=async()=>{try{await api('/auth/logout',{method:'POST'});window.location.reload();}catch(e){setError(e.message);}};
    if(!platformEnabled)return canvasId?<Suspense fallback={<ElrenLoadingScreen label="正在加载编辑器…"/>}><Editor/></Suspense>:<WorkspacePage createOnOpen={createOnOpen}/>;
    if(error)return <main className="platform-login"><div className="platform-card"><ElrenBrand/><h1>工作空间暂不可用</h1><p role="alert">{error}</p><Button variant="outline" onClick={()=>window.location.reload()}>重试</Button></div></main>;
    if(user===undefined)return <ElrenLoadingScreen label="正在连接工作空间…"/>;
    if(!user||user.must_change_password)return <AuthForm change={!!user} onDone={setUser}/>;
    if(isAdminPath&&user.role!=='admin')return <main className="platform-login"><div className="platform-card"><ElrenBrand/><h1>此页面仅限管理员访问</h1><Button onClick={()=>navigate('/')}>返回创作空间</Button></div></main>;
    if(isAdminPath)return <Suspense fallback={<ElrenLoadingScreen label="正在加载管理后台…"/>}><AdminWorkspace key={path} user={user} path={path} navigate={navigate} onLogout={logout}/></Suspense>;
    if(!ready)return <ElrenLoadingScreen label="正在加载项目…"/>;
    const panel=tab&&<CreatorPanel kind={tab} user={user} projects={projects} onClose={()=>setTab(null)}/>;
    const account=props=><CreatorAccountMenu user={user} onOpen={setTab} onAdmin={()=>navigate('/admin/models')} onLogout={logout} {...props}/>;
    if(!canvasId)return <><WorkspacePage createOnOpen={createOnOpen} account={account({placement:'header'})}/>{panel}</>;
    return <><Suspense fallback={<ElrenLoadingScreen label="正在加载编辑器…"/>}><Editor platformAccount={account({onWorkspace:()=>window.dispatchEvent(new CustomEvent('platform:workspace'))})} platformModels={models}/></Suspense>{panel}</>;
}
