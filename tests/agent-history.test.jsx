import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import AgentHistory from '@/components/editor/agent-history';
afterEach(cleanup);
const row = {id:'one',title:'产品广告',updated_at:Date.now()/1000,status:'idle'};
function setup(onRename = vi.fn().mockResolvedValue({})) {
    const onDelete=vi.fn().mockResolvedValue({}), onSelect=vi.fn();
    render(<AgentHistory sessions={[row]} currentId="one" onRefresh={vi.fn()} onRename={onRename} onDelete={onDelete} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button',{name:'创作对话'}));
    return {onRename,onDelete,onSelect};
}
it('shows modified time, edits inline and submits Enter plus blur only once', async () => {
    const {onRename,onSelect}=setup();
    expect(screen.getByText('刚刚')).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'编辑对话：产品广告'}));
    expect(screen.queryByRole('button',{name:'删除对话：产品广告'})).toBeNull();
    const input=screen.getByRole('textbox',{name:'对话名称'});
    fireEvent.change(input,{target:{value:'新广告'}});
    fireEvent.keyDown(input,{key:'Enter',isComposing:true,keyCode:229});
    expect(onRename).not.toHaveBeenCalled();
    fireEvent.keyDown(input,{key:'Enter'});fireEvent.blur(input);
    await waitFor(()=>expect(screen.queryByRole('textbox',{name:'对话名称'})).toBeNull());
    expect(onRename).toHaveBeenCalledTimes(1);
    expect(onRename).toHaveBeenCalledWith('one','新广告');
    expect(onSelect).not.toHaveBeenCalled();
});
it('saves on blur, keeps failed edits visible and does not select on delete', async () => {
    const onRename=vi.fn().mockRejectedValueOnce(new Error('保存失败')).mockResolvedValue({});
    const {onDelete,onSelect}=setup(onRename);
    fireEvent.click(screen.getByRole('button',{name:'编辑对话：产品广告'}));
    const input=screen.getByRole('textbox',{name:'对话名称'});
    fireEvent.change(input,{target:{value:'已修改'}});fireEvent.blur(input);
    expect((await screen.findByRole('alert')).textContent).toContain('保存失败');
    fireEvent.keyDown(input,{key:'Enter'});
    await waitFor(()=>expect(screen.queryByRole('textbox',{name:'对话名称'})).toBeNull());
    fireEvent.click(screen.getByRole('button',{name:'删除对话：产品广告'}));
    await waitFor(()=>expect(onDelete).toHaveBeenCalledWith('one'));
    expect(onSelect).not.toHaveBeenCalled();
});
