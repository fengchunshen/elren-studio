import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import AgentReference from '@/components/editor/agent-reference';
import CanvasAgentPanel from '@/components/editor/canvas-agent-panel';

afterEach(cleanup);
const reference = {node_id:'text-1',title:'一致性规则',type:'text-node',text:'人物服装保持一致',media_types:[]};

it('previews on hover and hides the preview when moving to remove', async () => {
    const remove = vi.fn();
    render(<AgentReference reference={reference} onRemove={remove} />);
    fireEvent.mouseEnter(screen.getByRole('button',{name:'预览引用：一致性规则'}));
    expect(await screen.findByText('人物服装保持一致')).toBeTruthy();
    fireEvent.mouseEnter(screen.getByRole('button',{name:'移除引用：一致性规则'}));
    expect(screen.queryByText('人物服装保持一致')).toBeNull();
    fireEvent.click(screen.getByRole('button',{name:'移除引用：一致性规则'}));
    expect(remove).toHaveBeenCalledTimes(1);
});

it('supports keyboard preview and escape without removing the reference', () => {
    render(<AgentReference reference={reference} onRemove={vi.fn()} />);
    const trigger=screen.getByRole('button',{name:'预览引用：一致性规则'});
    fireEvent.focus(trigger);
    expect(screen.getByText('人物服装保持一致')).toBeTruthy();
    fireEvent.keyDown(trigger,{key:'Escape'});
    expect(screen.queryByText('人物服装保持一致')).toBeNull();
});

it('offers clear all only for multiple references and keeps the draft text', () => {
    const clear = vi.fn();
    const props={open:true,ready:false,models:[],references:[reference],onClearReferences:clear,nodeName:()=>''};
    const view=render(<CanvasAgentPanel {...props} />);
    expect(screen.queryByRole('button',{name:'清除所有引用'})).toBeNull();
    fireEvent.change(screen.getByRole('textbox',{name:'创作要求'}),{target:{value:'继续创作'}});
    view.rerender(<CanvasAgentPanel {...props} references={[reference,{...reference,node_id:'text-2',title:'剧本'}]} />);
    fireEvent.click(screen.getByRole('button',{name:'清除所有引用'}));
    expect(clear).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('textbox',{name:'创作要求'}).value).toBe('继续创作');
});
