import React, { useId } from 'react';
import './elren-color-field.css';

// Broad overlapping colour planes, with a soft white channel and fine grain.
// Shared by the loading scene and its silhouette; no diagonal colour stops.
export function ElrenColorField({ variant = 'scene', className = '' }) {
    const id = `elren-field-${useId().replace(/:/g, '')}`;
    return <svg className={`elren-color-field elren-color-field-${variant} ${className}`} viewBox="0 0 1440 900" width="100%" height="100%" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <defs>
            <filter id={`${id}-soft`} x="-30%" y="-40%" width="160%" height="180%" colorInterpolationFilters="sRGB"><feGaussianBlur stdDeviation="74" /></filter>
            <filter id={`${id}-grain`} x="0" y="0" width="100%" height="100%">
                <feTurbulence type="fractalNoise" baseFrequency=".72" numOctaves="3" stitchTiles="stitch" />
                <feColorMatrix type="saturate" values="0" />
            </filter>
        </defs>
        <rect width="1440" height="900" fill="var(--field-base)" />
        <g filter={`url(#${id}-soft)`}>
            <g className="elren-field-flow elren-field-flow-a">
                <path fill="var(--field-blue)" d="M-300-180H440C570 30 550 140 375 252C170 385 274 536 486 580C716 628 630 826 470 1080H-300Z" />
                <path fill="var(--field-lilac)" d="M780-200H1690V1070H930C825 846 941 671 1190 580C1410 500 1270 325 1000 345C717 366 626 49 780-200Z" />
            </g>
            <g className="elren-field-flow elren-field-flow-b">
                <path fill="var(--field-cyan)" opacity=".8" d="M-200 748C158 622 274 671 397 424C536 146 704 33 803-180L1200-180C912 84 765 305 726 537C683 795 351 934-200 1110Z" />
                <path fill="var(--field-light)" d="M348-150C620 214 484 377 704 450C882 510 1052 390 1318 496C1421 537 1540 774 1630 961L1066 1030C1020 753 903 694 642 692C344 690 317 562 464 324C545 193 334 68 190-150Z" />
                <ellipse cx="1260" cy="115" rx="355" ry="190" fill="var(--field-pink)" opacity=".48" />
            </g>
        </g>
        <rect width="1440" height="900" filter={`url(#${id}-grain)`} className="elren-field-grain" />
    </svg>;
}
