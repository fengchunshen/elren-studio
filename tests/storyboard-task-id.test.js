import { expect, it } from 'vitest';
import { parseStoryboardSourceNodeId } from '@/lib/storyboard-task-id';
it('restores the exact shot identity even when it contains the separator', () => {
    expect(parseStoryboardSourceNodeId('storyboard-lo-board-shot-lo-shot-01')).toEqual({nodeId:'lo-board',shotId:'lo-shot-01',isImageMode:false});
    expect(parseStoryboardSourceNodeId('storyboard-img-node-123-shot-shot-456')).toEqual({nodeId:'node-123',shotId:'shot-456',isImageMode:true});
    expect(parseStoryboardSourceNodeId('lo-video-01')).toBeNull();
});
