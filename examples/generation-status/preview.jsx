import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { GenerationBody } from '../../src/components/editor/generation-node';
import { Button } from '../../src/components/ui/button';
import { applyTheme } from '../../src/lib/theme';
import '../../src/index.css';

function Preview() {
    const [status, setStatus] = useState('generating');
    const [startTime] = useState(Date.now);
    const [preview, setPreview] = useState(false);
    const task = { status, startTime, errorMsg: status === 'failed' ? '生成失败，请调整提示词后重试。' : status === 'reconciling' ? '结果尚未确认，请勿重复生成。' : '' };
    return <main className="min-h-screen p-8" style={{ background: 'hsl(var(--canvas-surface))' }}>
        <header className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground" style={{ marginBottom: 64 }}>
            <span className="mr-6">生成状态验收 · 示例数据，不提交任务</span>
            {[['generating', '生成中'], ['completed', '完成'], ['failed', '失败'], ['reconciling', '待核对']].map(([value, label]) => <Button key={value} variant={status === value ? 'secondary' : 'ghost'} size="sm" onClick={() => setStatus(value)}>{label}</Button>)}
            {['dark', 'light', 'solarized'].map(theme => <Button key={theme} variant="ghost" size="sm" onClick={() => applyTheme(theme)}>{theme}</Button>)}
        </header>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))', maxWidth: 1000, margin: '0 auto', gap: 48 }}>
            {[['已有作品', 'gen-image', '../perfume-ad/assets/hero.png'], ['首次生成', 'gen-image', ''], ['视频生成', 'gen-video', '']].map(([label, type, content]) => <section key={label}>
                <h2 className="mb-3 text-xs text-muted-foreground">{label}</h2>
                <div className="overflow-hidden rounded-2xl border border-border bg-card" style={{ aspectRatio: '4 / 3' }}>
                    <GenerationBody node={{ type, content }} task={task} onPreview={() => setPreview(true)} onFile={() => {}} />
                </div>
            </section>)}
        </div>
        {preview && <Button className="fixed bottom-8 left-8" onClick={() => setPreview(false)}>预览点击已响应 · 关闭</Button>}
    </main>;
}
applyTheme('dark');
createRoot(document.getElementById('root')).render(<Preview />);
