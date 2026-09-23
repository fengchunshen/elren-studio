import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { VideoEditControls } from '@/components/editor/video-edit-controls';
import { ProviderOperationInspector } from '@/components/editor/provider-operation-node';
import { videoEditRequest } from '@/lib/video-edit';
vi.mock('@/lib/video-frames', () => ({ captureVideoFrame: async () => ({ url: 'data:image/png;base64,frame', width: 640, height: 360 }) }));

it('captures a frame, maps a drag to normalized target geometry and keeps it in the submitted contract', async () => {
    let latest;
    function Harness() {
        const [settings, setSettings] = useState({}); latest = settings;
        return <VideoEditControls operation="video.remove" source="source.mp4" images={[]} settings={settings} onChange={patch => setSettings(previous => ({ ...previous, ...patch }))} />;
    }
    const view = render(<Harness />);
    await waitFor(() => expect(view.container.querySelector('video')).toBeTruthy());
    const video = view.container.querySelector('video');
    Object.defineProperty(video, 'duration', { configurable: true, value: 6 });
    fireEvent.loadedMetadata(video);
    fireEvent.click(screen.getByRole('button', { name: '使用当前帧圈选对象' }));
    const region = await screen.findByRole('group', { name: '拖动圈选视频对象' });
    vi.spyOn(region, 'getBoundingClientRect').mockReturnValue({ left: 100, top: 100, width: 400, height: 200 });
    fireEvent.pointerDown(region, { clientX: 200, clientY: 150, button: 0 });
    fireEvent.pointerMove(region, { clientX: 400, clientY: 250 });
    fireEvent.pointerUp(region, { clientX: 400, clientY: 250 });
    expect(latest.videoTarget.box).toEqual({ x: .25, y: .25, width: .5, height: .5 });
    const request = videoEditRequest('video.remove', latest, [{ url: 'source.mp4', type: 'video' }]);
    expect(request.videoEdit.target.time).toBe(0);
    expect(request.references.map(ref => ref.role)).toEqual(['source', 'target_frame']);
});

it('blocks a named video model when it has no structured edit protocol', () => {
    const run = vi.fn();
    render(<ProviderOperationInspector node={{ type: 'video-process', settings: { operation: 'video.replace', model: 'model', prompt: '替换' } }} models={[{ id: 'model', name: '未接入模型', platformOperation: 'video.replace' }]} onChange={() => {}} onRun={run} />);
    const button = screen.getByRole('button', { name: '替换对象' });
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(run).not.toHaveBeenCalled();
});
