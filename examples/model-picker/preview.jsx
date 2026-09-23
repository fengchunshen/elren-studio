import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { GenerationInspector } from '../../src/components/editor/generation-node';
import { AudioInspector } from '../../src/components/editor/audio-node';
import { TextGenerationInspector } from '../../src/components/editor/text-node';
import { Button } from '../../src/components/ui/button';
import { applyTheme } from '../../src/lib/theme';
import { modelSelectionPatch, modelsForNode } from '../../src/lib/generation-models';
import '../../src/index.css';

// Isolated UI fixtures. Never registered in the platform catalog or persisted.
const field = (name, values, defaultValue = values[0]) => ({ name, values, defaultValue });
const video = [
    { id: 'video-a', name: '示例视频 · 首尾帧', type: 'Video', platformOperation: 'video.generate', inputs: { frames: true, types: ['image'], limits: { image: 2 } }, customParams: [field('resolution', ['720P', '1080P']), field('ratio', ['16:9', '9:16']), field('duration', ['5', '10'])] },
    { id: 'video-b', name: '示例视频 · 快速', type: 'Video', platformOperation: 'video.generate', inputs: { types: [] }, customParams: [field('resolution', ['480P']), field('ratio', ['16:9']), field('duration', ['4', '8'])] },
    { id: 'video-c', name: '示例视频 · 自定义时长', type: 'Video', platformOperation: 'video.generate', inputs: { types: ['image', 'video', 'audio'] }, customParams: [field('resolution', ['1080P']), { name: 'duration', type: 'integer', min: 4, max: 15, defaultValue: 5 }] },
];
const models = [...video,
    ...Array.from({ length: 5 }, (_, i) => ({ ...video[0], id: `video-extra-${i}`, name: `示例视频 · 扩展 ${i + 1}` })),
    { id: 'image', name: '示例图片 · 参考生成', type: 'Image', platformOperation: 'image.edit', inputs: { types: ['image'], limits: { image: 4 } }, customParams: [field('size', ['1024x1024', '1536x1024']), field('n', ['1', '2', '4'])] },
    { id: 'image-other', name: '不应进入生成列表的打光模型', type: 'Image', platformOperation: 'image.relight', customParams: [] },
    { id: 'speech', name: '示例音频 · 配音', type: 'Audio', platformOperation: 'audio.generate', inputs: { audioPurpose: 'speech' }, customParams: [field('voice', ['柔和', '明亮'])] },
    { id: 'music', name: '示例音频 · 音乐', type: 'Audio', platformOperation: 'audio.generate', inputs: { audioPurpose: 'music' }, customParams: [{ name: 'instrumental', label: '纯音乐', type: 'boolean', defaultValue: true }] },
    { id: 'text', name: '示例文字模型', type: 'Chat', platformOperation: 'text.generate', inputs: { types: ['image'] }, customParams: [] },
];
function Preview() {
    const [type, setType] = useState('gen-video'), [empty, setEmpty] = useState(false), [narrow, setNarrow] = useState(false);
    const [settings, setSettings] = useState({ ...modelSelectionPatch(video[0]), videoPrompt: '镜头缓慢推进，保留人物与场景。', useFirstLastFrame: true });
    const available = empty ? [] : modelsForNode(models, type);
    const change = patch => setSettings(current => ({ ...current, ...patch }));
    const props = { node: { id: 'preview', type, settings }, models: available, onChange: change, onRun: async () => {}, onSettings: undefined };
    return <main style={{ minHeight: '100vh', background: 'hsl(var(--background))', color: 'hsl(var(--foreground))', padding: 24 }}>
        <header style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}><span style={{ marginRight: 16 }}>交互验收 · 示例模型，不发起生成</span>
            {[['gen-video', '视频'], ['gen-image', '图片'], ['gen-audio', '音频'], ['text-node', '文字']].map(([value, label]) => <Button key={value} variant="secondary" onClick={() => { setType(value); const first = modelsForNode(models, value)[0]; setSettings({ ...modelSelectionPatch(first), prompt: '', videoPrompt: '', generationPrompt: '', useFirstLastFrame: value === 'gen-video' }); }}>{label}</Button>)}
            <Button variant="ghost" onClick={() => setEmpty(!empty)}>切换空状态</Button><Button variant="ghost" onClick={() => setNarrow(!narrow)}>切换窄节点</Button>
            {['dark', 'light', 'solarized'].map(theme => <Button key={theme} variant="ghost" onClick={() => applyTheme(theme)}>{theme}</Button>)}
        </header>
        <div className="node-wrapper" style={{ position: 'absolute', top: 180, left: narrow ? 16 : 'calc(50% - 180px)', width: narrow ? 240 : 360, height: 200, border: '1px solid hsl(var(--border))', borderRadius: 18, background: 'hsl(var(--card))', display: 'grid', placeItems: 'center' }}>
            <span>示例节点</span>
            {type === 'gen-audio' ? <AudioInspector {...props} text="" /> : type === 'text-node' ? <TextGenerationInspector {...props} /> : <GenerationInspector {...props} references={[]} textInput="" onPort={() => {}} />}
        </div>
        <output aria-label="当前模型参数" style={{ position: 'fixed', bottom: 14, left: 24, fontSize: 12, color: 'hsl(var(--muted-foreground))', maxWidth: 'calc(100vw - 48px)' }}>{JSON.stringify(settings)}</output>
    </main>;
}
applyTheme('dark');
createRoot(document.getElementById('root')).render(<Preview />);
