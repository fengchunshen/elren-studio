import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { ElrenLoadingContext } from './elren-loading-context';
import { ElrenLoadingScene } from './elren-loader';

export const ELREN_LOADING_EXIT_MS = 180;

export function ElrenLoadingProvider({ children }) {
    const [activities, setActivities] = useState(() => new Map());
    const [retained, setRetained] = useState(false);
    const offset = useRef(Math.max(0, (performance.now() - (window.__ELREN_LOADING_STARTED_AT__ ?? performance.now())) / 1000));
    const update = useCallback((token, label) => {
        setActivities(previous => {
            if (label === null ? !previous.has(token) : previous.get(token) === label) return previous;
            const next = new Map(previous);
            if (label === null) next.delete(token); else next.set(token, label);
            return next;
        });
    }, []);
    const active = activities.size > 0;
    const label = [...activities.values()].at(-1) || '正在加载工作空间…';
    useLayoutEffect(() => {
        if (active) { setRetained(true); return; }
        if (!retained) return;
        const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        if (reduced) { setRetained(false); return; }
        const timer = window.setTimeout(() => setRetained(false), ELREN_LOADING_EXIT_MS);
        return () => window.clearTimeout(timer);
    }, [active, retained]);
    return <ElrenLoadingContext.Provider value={update}>
        <div className="elren-loading-content" inert={active ? '' : undefined} aria-busy={active || undefined}>{children}</div>
        {(active || retained) && <ElrenLoadingScene label={label} exiting={!active} animationOffset={offset.current} />}
    </ElrenLoadingContext.Provider>;
}
