import { expect, it } from 'vitest';
import project from '../examples/last-order/project.json';
import { instantiateWorkflow } from '@/lib/workspace-library';
import { appendConnectedVideoClips } from '@/lib/timeline';

it('imports a complete short drama graph and remaps every endpoint for reuse', () => {
    const copy = instantiateWorkflow(project, {x: 0, y: 0});
    const ids = new Set(copy.nodes.map(n => n.id));
    expect(copy.nodes).toHaveLength(37);
    expect(copy.connections).toHaveLength(60);
    expect(copy.connections.every(e => ids.has(e.from) && ids.has(e.to))).toBe(true);
    const shots = copy.nodes.find(n => n.type === 'storyboard-node').settings.shots;
    expect(shots.reduce((sum, shot) => sum + parseInt(shot.duration), 0)).toBe(60);
    const videos = copy.nodes.filter(n => n.type === 'gen-video');
    expect(videos).toHaveLength(12);
    for (const node of videos) expect(copy.connections.filter(e => e.to === node.id)).toHaveLength(1);
    expect(copy.nodes.find(n => n.type === 'video-timeline').settings.size).toBe('720x1280');
});

it('adds ready upstream videos once, preserving existing cuts and order', () => {
    const clips = [{id:'cut-b',nodeId:'b',url:'b.mp4',start:2,end:4}, {id:'cut-a',nodeId:'a',url:'a.mp4',start:1,end:3}];
    const sources = [{nodeId:'a',url:'new-a.mp4'}, {nodeId:'pending'}, {nodeId:'c',url:'c.mp4',name:'03',duration:5}, {nodeId:'c',url:'c.mp4'}];
    const next = appendConnectedVideoClips(clips, sources);
    expect(next.slice(0,2)).toEqual(clips);
    expect(next).toHaveLength(3);
    expect(next[2]).toMatchObject({nodeId:'c',url:'c.mp4',start:0,end:5});
    expect(appendConnectedVideoClips(next,sources)).toBe(next);
});
