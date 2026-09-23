import {expect,it} from 'vitest';
import project from '../examples/clear-cartoon-workflow/project.json';
import {resolveStoryboardShot} from '@/lib/storyboard-flow';
import {appendConnectedVideoClips,timelineSourcesForNode} from '@/lib/timeline';
import {instantiateWorkflow} from '@/lib/workspace-library';

it('has one image-to-video-to-timeline chain and preserves exact shot bindings when cloned',()=>{
 expect(project.nodes).toHaveLength(6);expect(project.connections).toHaveLength(5);
 const clone=instantiateWorkflow(project,{x:0,y:0});
 const image=clone.nodes.find(n=>n.settings?.workflowStage==='image');
 const video=clone.nodes.find(n=>n.settings?.workflowStage==='video');
 expect(video.settings.shots.every(s=>s.imageSource.nodeId===image.id)).toBe(true);
 const resolved=resolveStoryboardShot(video.settings.shots[0],video.id,new Map(clone.nodes.map(n=>[n.id,n])),clone.connections);
 expect(resolved.image_url).toBe('asset://assets/first-frame.png');
 expect(resolved.frameBindingError).toBe('');
});
it('uses only the corresponding confirmed frame and blocks missing or disconnected sources',()=>{
 const source={id:'images',settings:{mode:'image',shots:[{id:'01',title:'一',outputEnabled:true,selectedImageIndex:0,output_images:['one.png']},{id:'02',title:'二',outputEnabled:false,output_images:['two.png']}]}};
 const nodes=new Map([['images',source]]),edges=[{from:'images',to:'videos'}];
 const shot={id:'02',imageSource:{nodeId:'images',shotId:'02'},image_url:'stale.png'};
 expect(resolveStoryboardShot(shot,'videos',nodes,edges).image_url).toBe('');
 source.settings.shots[1].outputEnabled=true;
 expect(resolveStoryboardShot(shot,'videos',nodes,edges).image_url).toBe('two.png');
 source.settings.shots[1].output_images=['new-two.png'];
 expect(resolveStoryboardShot(shot,'videos',nodes,edges).image_url).toBe('new-two.png');
 expect(resolveStoryboardShot(shot,'videos',nodes,[]).frameBindingError).toBeTruthy();
});
it('imports every confirmed shot from a single board once, preserving editorial cuts and order',()=>{
 const board={id:'videos',type:'storyboard-node',settings:{mode:'video',shots:[{id:'01',title:'一',outputEnabled:true,output_url:'one.mp4',duration:'5s'},{id:'02',title:'二',outputEnabled:true,output_url:'two.mp4',duration:'5s'},{id:'03',output_url:'three.mp4',outputEnabled:false}]}};
 const sources=timelineSourcesForNode(board),clips=appendConnectedVideoClips([],sources);
 expect(clips.map(c=>c.url)).toEqual(['one.mp4','two.mp4']);
 clips[0].start=1;
 expect(appendConnectedVideoClips(clips,sources)).toBe(clips);
 board.settings.shots[2].outputEnabled=true;
 const next=appendConnectedVideoClips(clips,timelineSourcesForNode(board));
 expect(next).toHaveLength(3);expect(next[0].start).toBe(1);
});
