import React, { useId } from 'react';
import { ElrenMark } from './elren-brand';
import { ELREN_MOTION_SHAPES as shapes } from './elren-motion-shapes';
import { ElrenColorField } from './elren-color-field';
import './elren-motion-mark.css';

export function ElrenMotionMark() {
    const id = `elren-motion-${useId().replace(/:/g, '')}`;
    return <span className="elren-motion-mark" aria-hidden="true">
        <span className="elren-motion-original"><ElrenMark decorative /></span>
        <svg className="elren-motion-silhouette" viewBox="0 0 300 324" fill="none">
            <defs><clipPath id={id}>
                <path className="elren-motion-contour" d={shapes.logo} style={{ '--pose-logo': `path('${shapes.logo}')`, '--pose-circle': `path('${shapes.circle}')`, '--pose-square': `path('${shapes.square}')`, '--pose-square-turn': `path('${shapes.squareTurn}')` }} />
            </clipPath></defs>
            <g clipPath={`url(#${id})`}><ElrenColorField variant="mark" /></g>
        </svg>
    </span>;
}
