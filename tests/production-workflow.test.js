import { expect, it } from 'vitest';
import project from '../examples/production-workflow/project.json';
import { instantiateWorkflow } from '../src/lib/workspace-library';
import { resolveStoryboardShot } from '../src/lib/storyboard-flow';
import { appendConnectedVideoClips, timelineSourcesForNode } from '../src/lib/timeline';

it('clones a connected production with independent character assets and exact shot bindings', () => {
    const cloned = instantiateWorkflow(project, { x: 0, y: 0 });
    const images = cloned.nodes.find(n => n.settings?.workflowStage === 'image');
    const videos = cloned.nodes.find(n => n.settings?.workflowStage === 'video');
    const incoming = cloned.connections.filter(e => e.to === images.id).map(e => cloned.nodes.find(n => n.id === e.from));
    expect(incoming.filter(n => n.type === 'gen-image')).toHaveLength(3);
    expect(videos.settings.shots).toHaveLength(12);
    const nodes = new Map(cloned.nodes.map(n => [n.id, n]));
    for (const shot of videos.settings.shots) {
        expect(shot.imageSource.nodeId).toBe(images.id);
        expect(resolveStoryboardShot(shot, videos.id, nodes, cloned.connections).frameBindingError).toBeTruthy();
    }
    images.settings.shots[1].output_images = ['confirmed-frame.png'];
    images.settings.shots[1].selectedImageIndex = 0;
    images.settings.shots[1].outputEnabled = true;
    expect(resolveStoryboardShot(videos.settings.shots[1], videos.id, nodes, cloned.connections).image_url).toBe('confirmed-frame.png');
    expect(resolveStoryboardShot(videos.settings.shots[0], videos.id, nodes, cloned.connections).image_url).toBe('');
});

it('starts with no fabricated takes and only imports editorial selections', () => {
    const videos = structuredClone(project.nodes.find(n => n.settings?.workflowStage === 'video'));
    expect(timelineSourcesForNode(videos)).toHaveLength(0);
    videos.settings.shots[2].output_url = 'take-03.mp4';
    expect(timelineSourcesForNode(videos)).toHaveLength(0);
    videos.settings.shots[2].outputEnabled = true;
    const sources = timelineSourcesForNode(videos);
    const clips = appendConnectedVideoClips([], sources);
    expect(clips.map(c => c.url)).toEqual(['take-03.mp4']);
    clips[0].start = 1;
    expect(appendConnectedVideoClips(clips, sources)).toBe(clips);
});
