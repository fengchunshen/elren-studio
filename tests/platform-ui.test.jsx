import React from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PlatformRoot from '@/platform/PlatformRoot';
import AdminWorkspace from '@/platform/AdminWorkspace';
import {api} from '@/services/apiClient';
import {ElrenLoadingProvider} from '@/components/brand/elren-loading-provider';

vi.mock('@/services/apiClient',()=>({api:vi.fn(),setCsrf:vi.fn()}));
vi.mock('@/services/platformContext',()=>({platformEnabled:true,setPlatformContext:vi.fn(),getPlatformContext:()=>({})}));
vi.mock('@/App.jsx',()=>({default:({platformAccount})=><div data-testid="creator-canvas">{platformAccount}</div>}));
const admin={id:'u1',username:'test-admin',role:'admin'};
const creator={id:'u2',username:'creator',role:'user'};
beforeEach(()=>{
    window.localStorage.clear();window.history.replaceState({},'','/');api.mockReset();
    api.mockImplementation(async path=>path==='/auth/me'?{csrf_token:'test-only',user:admin}:path==='/projects'?{items:[{id:'p1',name:'测试项目',archived:false}]}:{items:[]});
});

it('retains loading through authentication and project loading',async()=>{
    let resolveAuth,resolveProjects;
    api.mockImplementation(path=>path==='/auth/me'?new Promise(r=>resolveAuth=r):path==='/projects'?new Promise(r=>resolveProjects=r):Promise.resolve({items:[]}));
    const view=render(<ElrenLoadingProvider><PlatformRoot/></ElrenLoadingProvider>);
    const scene=view.container.querySelector('.elren-loading-screen');
    expect(screen.getByRole('status').textContent).toContain('正在连接工作空间');
    await act(async()=>resolveAuth({user:admin,csrf_token:'test-only'}));
    expect(screen.getByRole('status').textContent).toContain('正在加载项目');
    expect(view.container.querySelector('.elren-loading-screen')).toBe(scene);
    await act(async()=>resolveProjects({items:[{id:'p1',name:'测试项目'}]}));
    expect(await screen.findByRole('button',{name:'账号菜单：test-admin'})).toBeTruthy();
});

it('submits the real login form with the existing API contract',async()=>{
    api.mockImplementation(async path=>{if(path==='/auth/me')throw Object.assign(new Error('未登录'),{status:401});throw new Error('测试拒绝登录');});
    const user=userEvent.setup();render(<PlatformRoot/>);
    await user.type(await screen.findByLabelText('账号'),'test-user');await user.type(screen.getByLabelText('密码'),'test-password');
    await user.click(screen.getByRole('button',{name:'登录'}));
    await waitFor(()=>expect(api).toHaveBeenCalledWith('/auth/login',{method:'POST',body:{username:'test-user',password:'test-password'}}));
    expect(await screen.findByRole('alert')).toBeTruthy();
});

it('ordinary account exposes personal tools and ignores legacy administration events',async()=>{
    api.mockImplementation(async path=>path==='/auth/me'?{user:creator}:path==='/projects'?{items:[{id:'p1',name:'测试项目'}]}:{items:[]});
    const user=userEvent.setup();render(<PlatformRoot/>);
    await user.click(await screen.findByRole('button',{name:'账号菜单：creator'}));
    expect(screen.getByRole('menuitem',{name:'账户管理'})).toBeTruthy();
    expect(screen.getByRole('menuitem',{name:'使用记录'})).toBeTruthy();
    expect(screen.queryByRole('menuitem',{name:'管理后台'})).toBeNull();
    await user.keyboard('{Escape}');
    for(const name of ['models','channels','prices','users'])await act(async()=>window.dispatchEvent(new CustomEvent('platform:panel',{detail:name})));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(api.mock.calls.some(([path])=>path.startsWith('/admin/'))).toBe(false);
});

it('ordinary user cannot mount administration through a direct URL',async()=>{
    window.history.replaceState({},'','/admin/models');
    api.mockImplementation(async path=>path==='/auth/me'?{user:creator}:path==='/projects'?{items:[{id:'p1',name:'测试项目'}]}:{items:[]});
    render(<PlatformRoot/>);
    expect(await screen.findByText('此页面仅限管理员访问')).toBeTruthy();
    expect(screen.queryByRole('navigation',{name:'后台导航'})).toBeNull();
    expect(api.mock.calls.some(([path])=>path.startsWith('/admin/'))).toBe(false);
});

it('administrator opens a full workspace instead of a canvas sheet',async()=>{
    window.history.replaceState({},'','/admin/models');render(<PlatformRoot/>);
    expect(await screen.findByRole('heading',{name:'模型管理'})).toBeTruthy();
    expect(screen.getByRole('navigation',{name:'后台导航'})).toBeTruthy();
    expect(screen.queryByTestId('creator-canvas')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText('官方 API 预设')).toBeNull();
});

it('model edit keeps channel, capability and upstream identity intact',async()=>{
    const model={id:'m1',created_at:1,name:'Seedream',channel_id:'c1',upstream_model:'verified-id',operation:'image.edit',adapter:'json_async',parameters:{size:{type:'string',enum:['2K']}},config:{body:{model:'{{model}}'}},active:false};
    api.mockImplementation(async path=>path==='/admin/models'?{items:[model]}:path==='/admin/channels'?{items:[{id:'c1',name:'火山方舟',active:true}]}:{items:[]});
    render(<AdminWorkspace user={admin} path="/admin/models" navigate={vi.fn()} onLogout={vi.fn()}/>);
    fireEvent.click(await screen.findByRole('button',{name:'编辑',exact:true}));
    expect(screen.getByLabelText('模型渠道').disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('显示名称'),{target:{value:'Seedream Pro'}});
    fireEvent.click(screen.getByRole('button',{name:'保存',exact:true}));
    await waitFor(()=>expect(api).toHaveBeenCalledWith('/admin/models/m1',{method:'PATCH',body:{...Object.fromEntries(Object.entries(model).filter(([key])=>!['id','created_at'].includes(key))),name:'Seedream Pro'}}));
});

it('preset catalog is loaded only after explicit administrator action',async()=>{
    render(<AdminWorkspace user={admin} path="/admin/models" navigate={vi.fn()} onLogout={vi.fn()}/>);
    await screen.findByText('暂无记录');expect(api).not.toHaveBeenCalledWith('/admin/model-presets');
    fireEvent.click(screen.getByRole('button',{name:'从预设添加'}));
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(api).toHaveBeenCalledWith('/admin/model-presets');
});

it('navigation never renders a previous section with the next section columns',async()=>{
    window.history.replaceState({},'','/admin/channels');
    api.mockImplementation(async path=>path==='/auth/me'?{user:admin}:path==='/projects'?{items:[{id:'p1',name:'测试项目'}]}:path==='/admin/channels'?{items:[{id:'c1',name:'火山方舟',base_url:'https://example.com',active:true,concurrency:2}]}:path==='/admin/price-versions'?{items:[{id:'price1',offering_id:'m1',kind:'cost',currency:'CNY',fx:'1',markup:'0',components:[{meter:'images',unit_size:'1',unit_price:'0.6'}],published_at:1}]}:{items:[]});
    render(<PlatformRoot/>);
    await screen.findByText('火山方舟');
    fireEvent.click(screen.getByRole('button',{name:'价格管理',exact:true}));
    expect(await screen.findByRole('heading',{name:'价格管理'})).toBeTruthy();
    expect(await screen.findByText('0.6 CNY / 1 图片')).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'模型管理',exact:true}));
    expect(await screen.findByRole('heading',{name:'模型管理'})).toBeTruthy();
    expect(await screen.findByText('暂无记录')).toBeTruthy();
});
