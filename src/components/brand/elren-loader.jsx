import React from 'react';
import { ElrenMotionMark } from './elren-motion-mark';
import { useElrenLoading } from './elren-loading-context';
import { cn } from '@/lib/utils';
import './elren-loader.css';

export function ElrenLoader({ label = '正在加载…', className }) {
    return <div className={cn('elren-loader', className)} role="status" aria-live="polite">
        <ElrenMotionMark />
        <span className="elren-loader-label">{label}</span>
    </div>;
}

export function ElrenLoadingScreen({ label }) {
    const managed = useElrenLoading(true, label);
    return managed ? null : <ElrenLoadingScene label={label} />;
}

export function ElrenLoadingScene({ label, exiting = false, animationOffset = 0 }) {
    return <div className="elren-loading-screen" data-state={exiting ? 'exiting' : 'loading'} aria-hidden={exiting || undefined}
        style={{ '--elren-motion-delay': `${-animationOffset}s`, '--elren-loading-offset': `${-animationOffset}s` }}>
        <ElrenLoader label={label} />
    </div>;
}
