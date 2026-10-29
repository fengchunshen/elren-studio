import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import CanvasAgentPanel from '@/components/editor/canvas-agent-panel';
import { api } from '@/services/apiClient';

vi.mock('@/services/apiClient', () => ({ api:vi.fn() }));
vi.mock('@/services/taskService', () => ({ notifyTask:vi.fn(), watchTask:vi.fn(async () => ({})) }));
vi.mock('@/services/projectStorage', () => ({ captureProjectStorage:() => ({getItem:() => 'test-browser',setItem:vi.fn()}) }));
afterEach(() => {cleanup();vi.clearAllMocks();});
const model={id:'model-1',displayName:'DeepSeek Flash',platformOperation:'text.generate'};

it('switches history from the header and returns to a new conversation without sending', async () => {
    const row={id:'history-1', title:'山野来信广告旁白创作', messages:[{id:'m1',role:'user',content:'首次创作要求'}],status:'idle',actions:[]};
    api.mockImplementation(async path => path === '/canvas-agent/status' ? {available:true}
        : path.startsWith('/canvas-agent/sessions?') ? {items:[row]} : row);
    render(<CanvasAgentPanel open ready projectId="project-1" models={[model]} onAction={vi.fn()} nodeName={() => ''} />);
    const select=await screen.findByRole('button',{name:'创作对话'});
    await screen.findByText('首次创作要求');
    expect(select.closest('header')).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'新建创作对话'}));
    expect(select.textContent).toContain('新对话');
    expect(screen.queryByText('首次创作要求')).toBeNull();
    fireEvent.click(select);
    fireEvent.click(await screen.findByRole('button',{name:'打开对话：'+row.title}));
    await screen.findByText('首次创作要求');
    expect(api.mock.calls.some(([,options]) => options?.method === 'POST')).toBe(false);
});

it('exposes the closed assistant through a directly accessible launcher', () => {
    const onOpen=vi.fn();
    render(<CanvasAgentPanel open={false} ready={false} projectId="project" models={[model]} onOpen={onOpen} nodeName={() => ''} />);
    fireEvent.click(screen.getByRole('button',{name:'打开 AI 创作'}));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('textbox',{name:'创作要求'})).toBeNull();
});

it('sends explicit canvas references with the message, independently of selection', async () => {
    const row={id:'session-r',title:'新对话',offering_id:model.id,messages:[],status:'idle',actions:[]};
    api.mockImplementation(async (path,options={}) => {
        if (path==='/canvas-agent/status') return {available:true};
        if (path.startsWith('/canvas-agent/sessions?')) return {items:[]};
        if (options.method==='POST') return row;
        return row;
    });
    const onStartPicking=vi.fn(), onRemoveReference=vi.fn(),onClearReferences=vi.fn();
    const reference={node_id:'node-b',title:'产品图',type:'gen-image',version:'v1',text:'',prompt:'银色水杯',media_types:['image'],preview_url:'data:image/png;base64,a'};
    render(<CanvasAgentPanel open ready projectId="project-1" models={[model]} references={[reference]} onStartPicking={onStartPicking}
        onRemoveReference={onRemoveReference} onClearReferences={onClearReferences} onAction={vi.fn()} nodeName={() => ''} />);
    fireEvent.click(screen.getByRole('button',{name:'从画布添加',exact:true}));expect(onStartPicking).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('group',{name:'引用：产品图'})).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox',{name:'创作要求'}),{target:{value:'按这张图做视频'}});
    fireEvent.click(screen.getByRole('button',{name:'发送创作要求'}));
    await waitFor(() => expect(api.mock.calls.some(([path])=>path.endsWith('/messages'))).toBe(true));
    const message=api.mock.calls.find(([path])=>path.endsWith('/messages'))[1].body;
    expect(message.references[0]).toMatchObject({node_id:'node-b',title:'产品图',prompt:'银色水杯'});
    expect(JSON.stringify(message)).not.toContain('base64');
    await waitFor(() => expect(onClearReferences).toHaveBeenCalledTimes(1));
});

it('requires explicit generation confirmation, then submits the prepared request once', async () => {
    let approved=false, submitted=false;
    const row={id:'session-1',offering_id:model.id,title:'产品图',messages:[],status:'waiting_approval'};
    api.mockImplementation(async (path, options={}) => {
        if (path==='/canvas-agent/status') return {available:true};
        if (path.startsWith('/canvas-agent/sessions?')) return {items:[row]};
        if (path.includes('/decision')) {approved=true;return {status:'approved'};}
        if (path.includes('/generate')) {submitted=true;return {id:'task-1',status:'queued'};}
        return {...row,actions:[{id:'action-1',tool:'generate_node',status:submitted?'done':approved?'approved':'approval',can_execute:true,arguments:{node_id:'image-1'}}]};
    });
    const onAction=vi.fn(async () => ({modelId:'image-model',input:{prompt:'test'}}));
    render(<CanvasAgentPanel open ready projectId="project-1" models={[model]} onAction={onAction} nodeName={() => '产品图片'} />);
    const button=await screen.findByRole('button',{name:'开始生成',exact:true});
    expect(onAction).not.toHaveBeenCalled();
    fireEvent.click(button);
    await waitFor(() => expect(onAction).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(submitted).toBe(true));
    expect(api.mock.calls.filter(([path]) => path.includes('/generate'))).toHaveLength(1);
});

it('does not send on an IME composition Enter and hides controls when closed', async () => {
    api.mockResolvedValue({items:[],available:true});
    const view=render(<CanvasAgentPanel open ready projectId="project-1" models={[model]} onAction={vi.fn()} nodeName={() => ''} />);
    const input=screen.getByRole('textbox',{name:'创作要求'});
    fireEvent.change(input,{target:{value:'创建图片'}});
    fireEvent.keyDown(input,{key:'Enter',isComposing:true,keyCode:229});
    expect(api.mock.calls.filter(([,options]) => options?.method==='POST')).toHaveLength(0);
    view.rerender(<CanvasAgentPanel open={false} ready projectId="project-1" models={[model]} onAction={vi.fn()} nodeName={() => ''} />);
    expect(screen.queryByRole('textbox',{name:'创作要求'})).toBeNull();
});
