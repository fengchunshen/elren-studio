import React from 'react';
import { render,screen,fireEvent } from '@testing-library/react';
import { expect,it,vi } from 'vitest';
import { StoryboardCards } from '@/components/editor/storyboard-cards';

const shots=[{id:'one',title:'雨夜',prompt:'雨夜柜台',duration:'5s',model:'video',image_url:'/first.png',status:'draft'}, {id:'two',title:'来客',prompt:'人物走近',duration:'5s',status:'draft'}];
const models=[{id:'video',displayName:'Seedance 2.5',type:'Video',inputs:{frames:true},durations:['5','10'],ratios:['9:16'],resolutions:['720p']}];
const props={nodeId:'board',shots,models,mode:'video',candidates:[],onChange:vi.fn(),onRun:vi.fn(),onAdd:vi.fn(),onDelete:vi.fn(),onMove:vi.fn(),onHistory:vi.fn(),onPreview:vi.fn()};
it('opens one shot editor from an overview without running or rewriting other shots',()=>{
 render(<StoryboardCards {...props}/>);
 expect(screen.queryByRole('textbox',{name:'镜头提示词'})).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'编辑镜头 1：雨夜'}));
 expect(screen.getByRole('textbox',{name:'镜头提示词'}).value).toBe('雨夜柜台');
 fireEvent.change(screen.getByRole('textbox',{name:'镜头提示词'}),{target:{value:'新镜头'}});
 expect(props.onChange).toHaveBeenLastCalledWith('one',{prompt:'新镜头'});
 fireEvent.click(screen.getByRole('button',{name:'下一镜'}));
 expect(screen.getByRole('textbox',{name:'镜头提示词'}).value).toBe('人物走近');
 expect(screen.getByRole('button',{name:'生成视频'}).disabled).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'全部镜头'}));
 expect(screen.queryByRole('textbox',{name:'镜头提示词'})).toBeNull();
 expect(props.onRun).not.toHaveBeenCalled();
});
it('renders actual failure and preserves a playable result while preventing duplicate execution',()=>{
 const view=render(<StoryboardCards {...props} shots={[{...shots[0],status:'failed',errorMsg:'参考图审核未通过',output_url:'/clip.mp4'}]}/>);
 fireEvent.click(screen.getByRole('button',{name:'编辑镜头 1：雨夜'}));
 expect(screen.getByRole('alert').textContent).toBe('参考图审核未通过');
 expect(document.querySelector('video[controls]').getAttribute('src')).toBe('/clip.mp4');
 view.rerender(<StoryboardCards {...props} shots={[{...shots[0],status:'generating'}]}/>);
 expect(screen.getByRole('button',{name:'正在生成'}).disabled).toBe(true);
});
