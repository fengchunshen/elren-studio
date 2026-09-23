import React, { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { GenerationInspector } from '@/components/editor/generation-node';
vi.mock('@/services/workspaceLibrary', () => ({ libraryScope: () => 'local', listLibraryEntries: async () => [] }));

const model = { id: 'image-model', name: 'Image model', resolutions: ['1K', '2K', '4K'], supportsFirstLastFrame: true };

it('blocks generation instead of silently dropping connected frames on an incompatible model', () => {
    render(<GenerationInspector node={{ type: 'gen-video', settings: { model: 'plain', videoPrompt: '缓慢推进' } }}
        models={[{ id: 'plain', platformOperation: 'video.generate', customParams: [] }]}
        references={[{ sourceNodeId: 'image', inputType: 'veo_start', label: '首帧' }]} textInput="" />);
    expect(screen.getByRole('button', { name: '开始生成' }).disabled).toBe(true);
    expect(screen.getByRole('status').textContent).toContain('不支持已连接的首尾帧');
});
function Harness({ video = false, onRun = vi.fn(), onPort = vi.fn(), onChange = vi.fn(), models = [model] }) {
    const [settings, setSettings] = useState({ model: model.id, ratio: '16:9', resolution: '2K', prompt: '白色香水瓶', videoPrompt: '缓慢推进' });
    return <GenerationInspector node={{ type: video ? 'gen-video' : 'gen-image', settings }} models={models} model={model} references={[]} textInput="" onRun={onRun} onPort={onPort} onSettings={() => {}} onChange={patch => { onChange(patch); setSettings(current => ({ ...current, ...patch })); }} />;
}

it('edits image specs in place, keeps option order stable, and restores focus without generating', async () => {
    const user = userEvent.setup(), onRun = vi.fn(), onChange = vi.fn();
    render(<Harness onRun={onRun} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: '生成规格' }));
    const order = () => screen.getAllByRole('button', { name: /^比例 / }).map(button => button.textContent);
    const before = order();
    await user.click(screen.getByRole('button', { name: '比例 9:16' }));
    await user.click(screen.getByRole('button', { name: '画质 4K' }));
    expect(order()).toEqual(before);
    expect(screen.getByRole('button', { name: '比例 9:16' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: '生成规格' }).textContent).toContain('9:16 · 4K');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('button', { name: '比例 9:16' })).toBeNull());
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '生成规格' }));
    await user.click(screen.getByRole('button', { name: '生成数量' }));
    await user.click(screen.getByRole('menuitemradio', { name: '4 张' }));
    expect(onChange).toHaveBeenLastCalledWith({ concurrentImages: 4, imageConcurrency: 4 });
    expect(screen.getByRole('button', { name: '生成数量' }).textContent).toContain('4×');
    expect(onRun).not.toHaveBeenCalled();
    expect(document.querySelector('select')).toBeNull();
}, 40000);

it('keeps video duration and first/last frame connections in the specification panel', async () => {
    const user = userEvent.setup(), onPort = vi.fn(), onChange = vi.fn();
    render(<Harness video onPort={onPort} onChange={onChange} />);
    expect(screen.queryByRole('button', { name: '生成数量' })).toBeNull();
    await user.click(screen.getByRole('button', { name: '生成规格' }));
    await user.click(screen.getByRole('button', { name: '时长 8s' }));
    expect(onChange).toHaveBeenLastCalledWith({ duration: '8s' });
    await user.click(screen.getByRole('checkbox', { name: '使用首尾帧' }));
    await user.click(screen.getByRole('button', { name: '连接首帧' }));
    expect(onPort).toHaveBeenCalledWith('veo_start');
    expect(screen.getByRole('button', { name: '生成规格' }).textContent).toContain('首尾帧 · 16:9 · 2K · 8s');
}, 40000);

it('selects models with the keyboard and keeps generation unavailable without a model', async () => {
    const user = userEvent.setup(), onChange = vi.fn();
    const view = render(<Harness models={[model, { id: 'second-model', name: 'Second model' }]} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: '生成模型' }));
    await user.keyboard('{Home}{ArrowDown}{Enter}');
    expect(onChange.mock.calls.at(-1)[0]).toMatchObject({ model: 'second-model', customParams: {}, useFirstLastFrame: false });
    view.unmount();
    render(<Harness models={[]} />);
    expect(screen.getByRole('button', { name: '开始生成' }).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: '生成模型' }));
    expect(screen.getByRole('status').textContent).toContain('暂无可用的图片模型');
    expect(screen.getByRole('menuitem', { name: '管理模型' })).toBeTruthy();
}, 40000);

it('uses platform declarations for specs and clears incompatible settings on model switch', async () => {
    const user = userEvent.setup(), onChange = vi.fn(), onRun = vi.fn();
    const models = [
        { id: 'old', name: '旧视频模型', platformOperation: 'video.generate', inputs: { frames: true }, customParams: [
            { name: 'resolution', values: ['1080P'], defaultValue: '1080P' }, { name: 'duration', type: 'integer', values: ['10'], defaultValue: 10 },
        ] },
        { id: 'new', name: '快速视频模型', platformOperation: 'video.generate', inputs: {}, customParams: [
            { name: 'resolution', values: ['480P'], defaultValue: '480P' }, { name: 'duration', type: 'integer', values: ['4', '8'], defaultValue: 4 },
        ] },
    ];
    function PlatformHarness() {
        const [settings, setSettings] = useState({ model: 'old', resolution: '1080P', duration: '10', useFirstLastFrame: true, videoPrompt: '保留这段提示词', customParams: { old_only: true } });
        return <GenerationInspector node={{ type: 'gen-video', settings }} models={models} references={[]} textInput="" onRun={onRun} onChange={patch => { onChange(patch); setSettings(s => ({ ...s, ...patch })); }} />;
    }
    render(<PlatformHarness />);
    await user.click(screen.getByRole('button', { name: '生成模型' }));
    await user.click(screen.getByRole('menuitemradio', { name: /快速视频模型/ }));
    expect(onChange.mock.calls.at(-1)[0]).toMatchObject({ model: 'new', resolution: '480P', duration: '4', useFirstLastFrame: false });
    expect(onChange.mock.calls.at(-1)[0].customParams).not.toHaveProperty('old_only');
    expect(screen.getByRole('textbox', { name: '视频提示词' }).textContent).toBe('保留这段提示词');
    await user.click(screen.getByRole('button', { name: '生成规格' }));
    expect(screen.queryByRole('checkbox', { name: '使用首尾帧' })).toBeNull();
    expect(screen.queryByRole('button', { name: '画质 1080P' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^比例 / })).toBeNull();
    await user.click(screen.getByRole('button', { name: '时长 8s' }));
    expect(onChange.mock.calls.at(-1)[0]).toEqual({ duration: '8', customParams: { resolution: '480P', duration: '8' } });
    expect(onRun).not.toHaveBeenCalled();
}, 40000);

it('keeps generation disabled after reopening a running node and settles from the shared task', () => {
    const props = {node:{id:'n',type:'gen-image',settings:{model:model.id,prompt:'人物定妆'}},models:[model],references:[],textInput:'',onRun:vi.fn(),onChange:vi.fn()};
    const view = render(<GenerationInspector {...props} task={{id:'new',status:'generating'}} />);
    expect(screen.getByRole('button',{name:'正在生成'}).disabled).toBe(true);
    view.unmount();
    const reopened = render(<GenerationInspector {...props} task={{id:'new',status:'generating'}} />);
    expect(screen.getByRole('button',{name:'正在生成'}).disabled).toBe(true);
    reopened.rerender(<GenerationInspector {...props} task={{id:'new',status:'completed'}} />);
    expect(screen.getByRole('button',{name:'开始生成'}).disabled).toBe(false);
    reopened.rerender(<GenerationInspector {...props} task={{id:'new',status:'reconciling'}} />);
    expect(screen.queryByRole('button',{name:'正在生成'})).toBeNull();
});
