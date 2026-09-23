import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {StoryboardCards} from '../../src/components/editor/storyboard-cards';
import {applyTheme} from '../../src/lib/theme';
import {Button} from '../../src/components/ui/button';
import project from '../last-order/project.json';
import '../../src/index.css';
function Preview(){
 const [width,setWidth]=useState(1000),[shots,setShots]=useState(project.nodes.find(n=>n.type==='storyboard-node').settings.shots.map((s,i)=>({...s,image_url:i===0?'../last-order/assets/visual-reference.png':'',status:i===0?'failed':'draft',errorMsg:i===0?'示例错误：参考素材未通过审核':'',model:'demo'})));
 return <main className="min-h-screen bg-background p-6 text-foreground"><div className="mb-6 flex gap-2"><span className="text-xs text-muted-foreground">布局验收 · 示例数据，不调用模型</span>{[1000,480].map(w=><Button key={w} onClick={()=>setWidth(w)} variant="outline" size="sm">{w}px</Button>)}{['dark','light','solarized'].map(t=><Button key={t} variant="ghost" size="sm" onClick={()=>applyTheme(t)}>{t}</Button>)}</div><div style={{width,maxWidth:'100%'}} className="rounded-2xl border border-border p-4"><StoryboardCards nodeId="demo" shots={shots} mode="video" models={[{id:'demo',displayName:'演示视频模型',type:'Video',ratios:['9:16'],resolutions:['720p'],durations:['5','10']}]} candidates={[]} onChange={(id,patch)=>setShots(s=>s.map(x=>x.id===id?{...x,...patch}:x))} onRun={()=>{}} onAdd={()=>{}} onDelete={id=>setShots(s=>s.filter(x=>x.id!==id))} onMove={()=>{}} onHistory={()=>{}} onPreview={()=>{}} /></div></main>
}
applyTheme('dark');createRoot(document.getElementById('root')).render(<Preview/>);
