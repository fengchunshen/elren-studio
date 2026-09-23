import React from 'react';
import { expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StoryboardFramePicker } from '@/components/editor/storyboard-frame-picker';
import { GenerationModelPicker } from '@/components/editor/generation-model-picker';
import { storyboardFrameCandidates, storyboardFramePatch, storyboardVideoReferences } from '@/lib/storyboard-frames';

it('offers generated canvas images, blocks unfinished sources and preserves selected frame roles', () => {
    const nodes = [{id:'frame',type:'gen-image',title:'01 杯子首帧',content:'/frame.png'}, {id:'empty',type:'gen-image',title:'02 未生成'}, {id:'text',type:'text-node'}, {id:'board',type:'storyboard-node'}];
    const candidates = storyboardFrameCandidates(nodes,'board',[{id:'running',sourceNodeId:'empty',status:'generating'}]);
    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toMatchObject({ready:true,url:'/frame.png'});
    expect(candidates[1]).toMatchObject({ready:false,status:'生成中'});
    const shot = {...storyboardFramePatch('image_url',candidates[0]),useFirstLastFrame:true,lastFrame:'/end.png'};
    expect(shot.image_urlSource.nodeId).toBe('frame');
    expect(storyboardVideoReferences(shot)).toEqual([{url:'/frame.png',type:'image',role:'first_frame'},{url:'/end.png',type:'image',role:'last_frame'}]);
    expect(storyboardVideoReferences({...shot,useFirstLastFrame:false})).toHaveLength(1);
});
it('selects an existing first frame by name and closes the picker without opening upload', async () => {
    const user=userEvent.setup(),onSelect=vi.fn(),onUpload=vi.fn();
    render(<StoryboardFramePicker label="首帧" candidates={[{id:'frame',label:'01 杯子首帧',url:'/frame.png',ready:true,status:'可用'},{id:'empty',label:'未完成',ready:false,status:'生成中'}]} onSelect={onSelect} onUpload={onUpload} />);
    fireEvent.click(screen.getByRole('button',{name:'选择首帧'}));
    expect(screen.getByRole('button',{name:'未完成 生成中'}).disabled).toBe(true);
    fireEvent.change(screen.getByRole('textbox',{name:'搜索首帧'}),{target:{value:'杯子'}});
    fireEvent.click(screen.getByRole('button',{name:'01 杯子首帧 可用'}));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({id:'frame',url:'/frame.png'}));
    expect(onUpload).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox',{name:'搜索首帧'})).toBeNull();
});
it('displays public model names instead of provider keys or UUIDs', async () => {
    const user=userEvent.setup(),onChange=vi.fn();
    render(<GenerationModelPicker kind="video" models={[{id:'uuid-internal',displayName:'Seedance 2.5',provider:'platform'}]} value="" onChange={onChange} />);
    fireEvent.pointerDown(screen.getByRole('button',{name:'生成模型'}),{button:0,ctrlKey:false});
    fireEvent.click(screen.getByRole('menuitemradio',{name:'Seedance 2.5'}));
    expect(onChange).toHaveBeenCalledWith('uuid-internal');
    expect(screen.queryByText('platform')).toBeNull();
    expect(screen.queryByText('uuid-internal')).toBeNull();
});
