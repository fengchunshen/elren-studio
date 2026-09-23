import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from '../../src/components/ui/button';
import { Slider } from '../../src/components/ui/slider';
import { ElrenMotionMark } from '../../src/components/brand/elren-motion-mark';
import { applyTheme } from '../../src/lib/theme';
import '../../src/index.css';
import './preview.css';

function Preview() {
    const [enlarged, setEnlarged] = useState(false);
    const [paused, setPaused] = useState(false);
    const [revision, setRevision] = useState(0);
    const [frame, setFrame] = useState(0);
    const [outlineHeld, setOutlineHeld] = useState(false);
    useEffect(() => applyTheme('dark'), []);
    return <main className={`brand-preview ${paused ? 'is-paused' : ''}`}>
        <header><span>加载动效预览</span></header>
        <section className={`brand-preview-stage ${enlarged ? 'is-enlarged' : ''} ${paused ? 'is-paused' : ''} ${outlineHeld ? 'is-outline-held' : ''}`}>
            <div className="brand-motion-preview" style={{ '--elren-motion-delay': `${-3.44 * frame / 100}s` }} key={`${revision}-${frame}`} role="status" aria-label="正在加载工作空间"><ElrenMotionMark /></div>
        </section>
        <footer>
            <Button variant="outline" size="sm" aria-pressed={paused} onClick={() => setPaused(!paused)}>{paused ? '继续播放' : '暂停'}</Button>
            <Button variant="outline" size="sm" onClick={() => { setRevision(revision + 1); setFrame(0); setPaused(false); setOutlineHeld(false); }}>重播</Button>
            <Button variant="ghost" size="sm" aria-pressed={outlineHeld} onClick={() => { setOutlineHeld(!outlineHeld); setFrame(outlineHeld ? 0 : 36); setPaused(false); setRevision(revision + 1); }}>固定轮廓</Button>
            <Button variant="ghost" size="sm" aria-pressed={enlarged} onClick={() => setEnlarged(!enlarged)}>放大查看</Button>
            <div className="brand-preview-timeline"><span>轮廓进度</span><Slider aria-label="动画进度" value={[frame]} min={0} max={100} step={1} onValueChange={([value]) => { setFrame(value); setOutlineHeld(true); setPaused(false); }} /><span>{frame}%</span></div>
        </footer>
    </main>;
}

createRoot(document.getElementById('root')).render(<Preview />);
