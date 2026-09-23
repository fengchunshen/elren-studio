export function nodeInspectorPosition(bounds, panelHeight, viewport, preferredWidth) {
    const margin = 12, topInset = Math.min(72, viewport.height / 4);
    const width = Math.max(0, Math.min(preferredWidth || 560, viewport.width - margin * 2, Math.max(preferredWidth || bounds.width, 360)));
    // Reserve a visible part of the node even on short screens; long panels scroll internally.
    const nodePeek = Math.min(80, Math.max(0, bounds.bottom - bounds.top));
    const minTop = topInset + nodePeek + margin;
    const maxHeight = Math.max(1, viewport.height - minTop - margin);
    const height = Math.min(panelHeight, maxHeight);
    const top = bounds.bottom + margin;
    const targetTop = Math.max(minTop, Math.min(viewport.height - height - margin, top));
    return {
        left: Math.max(margin, Math.min(viewport.width - width - margin, bounds.left + (bounds.width - width) / 2)),
        top,
        width,
        maxHeight,
        panY: targetTop - top,
    };
}
