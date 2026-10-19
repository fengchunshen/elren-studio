import { describe, it, expect } from 'vitest';
import { applyAgentWorkflow, inspectWorkflow } from '../src/lib/canvas-agent-workflow';
import { agentNodeVersion, applyAgentPatch } from '../src/lib/canvas-agent';
import { SHORT_DRAMA_BLUEPRINT, readWorkflowLibrary } from '../src/lib/agent-workflow-library';
import { resolveStoryboardShot, storyboardMotionPrompt } from '../src/lib/storyboard-flow';
import { appendConnectedVideoClips, timelineSourcesForNode } from '../src/lib/timeline';

const models = [
    {id:'image',platformOperation:'image.edit',inputs:{types:['image'],max:4},customParams:[{name:'ratio',values:['9:16'],defaultValue:'9:16'}]},
    {id:'video',platformOperation:'video.generate',inputs:{types:['image'],max:2},customParams:[{name:'duration',values:['5'],defaultValue:'5'},{name:'ratio',values:['16:9','9:16'],defaultValue:'16:9'}]},
];
const create = (plan = SHORT_DRAMA_BLUEPRINT, nodes = [], links = [], id = 'test-workflow') => applyAgentWorkflow(nodes,links,{id,arguments:structuredClone(plan)},models);

describe('connected creative workflow commands', () => {
    it('builds forward references, stage models and stable shot bindings; distinguishes waiting assets from an invalid graph', () => {
        const plan = structuredClone(SHORT_DRAMA_BLUEPRINT);
        plan.nodes.reverse();
        const result = create(plan);
        expect(result.nodes).toHaveLength(8);
        expect(result.connections).toHaveLength(11);
        expect(result.result.validation.structure_valid).toBe(true);
        expect(result.result.validation.ready).toBe(false);
        expect(result.result.validation.blockers.some(item => item.code === 'missing_reference_image')).toBe(true);
        const images = result.nodes.find(node => node.settings.workflowStage === 'image');
        const videos = result.nodes.find(node => node.settings.workflowStage === 'video');
        expect(images.settings.model).toBe('image'); expect(videos.settings.model).toBe('video');
        expect(images.settings.shots.every(shot => shot.model === 'image')).toBe(true);
        expect(videos.settings.shots.every(shot => shot.model === 'video')).toBe(true);
        expect(videos.settings.shots[0].imageSource).toEqual({nodeId:images.id,shotId:'shot-01'});
        expect(result.nodes.every(node => node.workflowGroup.name === plan.name)).toBe(true);
        expect(new Set(result.nodes.map(node => `${node.x},${node.y}`)).size).toBe(result.nodes.length);
        expect(create(plan,result.nodes,result.connections).nodes).toEqual(result.nodes);
    });
    it('only consumes confirmed corresponding frames, and only selected videos enter the timeline without losing trims', () => {
        const result = create();
        const images = result.nodes.find(node => node.settings.workflowStage === 'image');
        const videos = result.nodes.find(node => node.settings.workflowStage === 'video');
        const map = new Map(result.nodes.map(node => [node.id,node]));
        images.settings.shots[0].output_images = ['frame.png'];
        expect(resolveStoryboardShot(videos.settings.shots[0],videos.id,map,result.connections).frameBindingError).toBeTruthy();
        images.settings.shots[0].outputEnabled = true; images.settings.shots[0].selectedImageIndex = 0;
        expect(resolveStoryboardShot(videos.settings.shots[0],videos.id,map,result.connections).image_url).toBe('frame.png');
        expect(resolveStoryboardShot(videos.settings.shots[1],videos.id,map,result.connections).image_url).toBe('');
        videos.settings.shots[0].output_url = 'take.mp4';
        expect(timelineSourcesForNode(videos)).toHaveLength(0);
        videos.settings.shots[0].outputEnabled = true;
        const clips = appendConnectedVideoClips([],timelineSourcesForNode(videos)); clips[0].start = 1;
        expect(appendConnectedVideoClips(clips,timelineSourcesForNode(videos))).toBe(clips);
    });
    it('rejects malformed topology, incompatible ports, missing frame identities and stale reused nodes atomically', () => {
        const invalid = structuredClone(SHORT_DRAMA_BLUEPRINT);
        invalid.connections.push({source:'look',target:'edit'});
        expect(() => create(invalid)).toThrow('不支持');
        const cycle = structuredClone(SHORT_DRAMA_BLUEPRINT);
        cycle.connections.push({source:'character',target:'script'});
        expect(() => create(cycle)).toThrow('循环');
        const badShot = structuredClone(SHORT_DRAMA_BLUEPRINT);
        badShot.nodes.find(node => node.key === 'motion').shots[0].image_source.shot_id = 'nonexistent';
        expect(() => create(badShot)).toThrow('绑定');
        const isolated = structuredClone(SHORT_DRAMA_BLUEPRINT);
        isolated.connections = isolated.connections.filter(edge => edge.source !== 'environment' && edge.target !== 'environment');
        expect(() => create(isolated)).toThrow('实际连线');
        const original = {id:'old-script',type:'text-node',settings:{text:'user original'},x:0,y:0};
        const reuse = structuredClone(SHORT_DRAMA_BLUEPRINT);
        Object.assign(reuse.nodes[0],{id:original.id,expected_version:'stale'});
        expect(() => create(reuse,[original])).toThrow('节点已被修改');
        expect(original.settings.text).toBe('user original');
    });
    it('preserves existing media and unrelated nodes when repairing a workflow', () => {
        const old = {id:'old-look',type:'gen-image',content:'old-image.png',settings:{model:'image',prompt:'old'},x:0,y:0,width:200,height:200};
        const unrelated = {id:'unrelated',type:'text-node',settings:{text:'keep'},x:-900,y:-900};
        const plan = structuredClone(SHORT_DRAMA_BLUEPRINT);
        Object.assign(plan.nodes.find(node => node.key === 'look'),{id:old.id,expected_version:agentNodeVersion(old,[])});
        const result = create(plan,[old,unrelated]);
        expect(result.nodes.find(node => node.id === old.id).content).toBe('old-image.png');
        expect(result.nodes.find(node => node.id === unrelated.id)).toBe(unrelated);
        const frames = result.nodes.find(node => node.settings.workflowStage === 'image');
        const videos = result.nodes.find(node => node.settings.workflowStage === 'video');
        const broken = result.connections.filter(edge => !(edge.from === frames.id && edge.to === videos.id));
        expect(inspectWorkflow(result.nodes,broken,result.touched,models).errors.some(item => item.code === 'invalid_shot_binding')).toBe(true);
    });
    it('publishes practical structures and actual port contracts to the assistant', () => {
        const library = readWorkflowLibrary();
        expect(library.recipes[0].blueprint.connections).toHaveLength(11);
        expect(library.nodes.find(node => node.type === 'gen-video').inputs.veo_start.max).toBe(1);
        expect(JSON.stringify(library)).not.toContain('api_key');
    });
    it('relayouts a saved production without rewriting shots or model settings, and leaves room below tall boards', () => {
        const original = create();
        const frames = original.nodes.find(node => node.settings.workflowStage === 'image');
        frames.settings.customParams = {custom_user_value:7};
        const plan = {name:'紧凑制作',nodes:SHORT_DRAMA_BLUEPRINT.nodes.map(patch => {
            const id = `agent-test-workflow-${patch.key}`, node = original.nodes.find(item => item.id === id);
            return {key:patch.key,type:patch.type,id,expected_version:agentNodeVersion(node,original.connections),column:patch.column};
        }),connections:SHORT_DRAMA_BLUEPRINT.connections};
        const changed = create(plan,original.nodes,original.connections,'relayout');
        const saved = changed.nodes.find(node => node.id === frames.id);
        expect(saved.settings.shots).toBe(frames.settings.shots);
        expect(saved.settings.customParams).toEqual({custom_user_value:7});
        expect(changed.connections).toEqual(original.connections);
        const sameColumn = structuredClone(SHORT_DRAMA_BLUEPRINT);
        sameColumn.nodes.find(node => node.key === 'look').column = 3;
        const result = create(sameColumn);
        const column = result.nodes.filter(node => ['agent-test-workflow-look','agent-test-workflow-frames'].includes(node.id));
        expect(Math.max(...column.map(node => node.y))).toBeGreaterThanOrEqual(Math.min(...column.map(node => node.y)) + column[0].height + 130);
    });
    it('syncs a board model into the actual shot execution settings without losing frame identity or outputs', () => {
        const result = create();
        const video = result.nodes.find(node => node.settings.workflowStage === 'video');
        video.settings.shots[0].output_url = 'old-take.mp4';
        video.settings.shots.forEach(shot => delete shot.model);
        expect(inspectWorkflow(result.nodes,result.connections,result.touched,models).blockers.some(item => item.code === 'missing_shot_model')).toBe(true);
        const changed = applyAgentPatch(result.nodes,result.connections,{id:'sync-model',arguments:{nodes:[{id:video.id,expected_version:agentNodeVersion(video,result.connections),model:'video'}]}},models);
        const saved = changed.nodes.find(node => node.id === video.id);
        expect(saved.settings.shots.every(shot => shot.model === 'video')).toBe(true);
        expect(saved.settings.shots.every(shot => shot.ratio === '9:16')).toBe(true);
        expect(saved.settings.shots[0].imageSource).toEqual(video.settings.shots[0].imageSource);
        expect(saved.settings.shots[0].output_url).toBe('old-take.mp4');
        const prompt = storyboardMotionPrompt({...saved.settings.shots[0],dialogue:'不要开门。',sound:'电话铃响'});
        expect(prompt).toContain('不要开门。'); expect(prompt).toContain('电话铃响');
        expect(prompt).not.toContain('frame.png');
    });
});
