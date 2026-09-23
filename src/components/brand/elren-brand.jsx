import React, { useId } from 'react';
import markSvg from '@/assets/brand/elren-mark.svg?raw';
import wordmarkSvg from '@/assets/brand/elren-wordmark.svg?raw';
import { cn } from '@/lib/utils';
import './elren-brand.css';

// Only bundled SVG source is inlined. Each instance owns its gradient IDs so
// hidden dialogs cannot invalidate another mark's paint servers.
export function ElrenMark({ className, decorative = false }) {
    const id = `elren-${useId().replace(/:/g, '')}-`;
    return <span className={cn('elren-mark', className)} role={decorative ? undefined : 'img'}
        aria-label={decorative ? undefined : 'Elren Studio'} aria-hidden={decorative || undefined}
        dangerouslySetInnerHTML={{ __html: markSvg.replaceAll('elren-mark-', id) }} />;
}

export function ElrenWordmark({ className, decorative = false }) {
    return <span className={cn('elren-wordmark', className)} role={decorative ? undefined : 'img'}
        aria-label={decorative ? undefined : 'ELREN'} aria-hidden={decorative || undefined}
        dangerouslySetInnerHTML={{ __html: wordmarkSvg }} />;
}

export function ElrenBrand({ className, compact = false }) {
    return <span className={cn('elren-brand', compact && 'elren-brand-compact', className)} role="img" aria-label="Elren Studio">
        <ElrenMark decorative />
        <ElrenWordmark decorative />
    </span>;
}
