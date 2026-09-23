export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 3;
export const GRID_SIZE = 20;

export function clampZoom(zoom) {
    return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

export function zoomAtPoint(view, zoom, point) {
    const nextZoom = clampZoom(zoom);
    const scale = nextZoom / view.zoom;
    return {
        zoom: nextZoom,
        x: point.x - (point.x - view.x) * scale,
        y: point.y - (point.y - view.y) * scale,
    };
}

export function getNodeBounds(nodes) {
    if (!nodes.length) return null;
    return nodes.reduce((bounds, node) => ({
        left: Math.min(bounds.left, node.x),
        top: Math.min(bounds.top, node.y),
        right: Math.max(bounds.right, node.x + (node.width || 320)),
        bottom: Math.max(bounds.bottom, node.y + (node.height || 240)),
    }), { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
}

export function fitCanvasView(nodes, viewport) {
    const bounds = getNodeBounds(nodes);
    if (!bounds) return { x: 0, y: 0, zoom: 1 };
    const padding = Math.min(64, viewport.width / 8, viewport.height / 8);
    const zoom = clampZoom(Math.min(
        1,
        (viewport.width - padding * 2) / Math.max(1, bounds.right - bounds.left),
        (viewport.height - padding * 2) / Math.max(1, bounds.bottom - bounds.top),
    ));
    return {
        zoom,
        x: viewport.width / 2 - (bounds.left + bounds.right) / 2 * zoom,
        y: viewport.height / 2 - (bounds.top + bounds.bottom) / 2 * zoom,
    };
}

// Creating a node should not change the user's working scale or fit distant content.
export function revealCanvasNode(view, node, viewport) {
    if (!(viewport.width > 0 && viewport.height > 0)) return view;
    const leftInset = Math.min(24, viewport.width / 4), rightEdge = viewport.width - leftInset;
    const topInset = Math.min(72, viewport.height / 4), bottomEdge = viewport.height - Math.min(24, viewport.height / 4);
    const left = node.x * view.zoom + view.x, top = node.y * view.zoom + view.y;
    const width = (node.width || 320) * view.zoom, height = (node.height || 240) * view.zoom;
    const shift = (start, size, min, max) => size > max - min ? min - start : start < min ? min - start : start + size > max ? max - start - size : 0;
    const dx = shift(left, width, leftInset, rightEdge), dy = shift(top, height, topInset, bottomEdge);
    return dx || dy ? { ...view, x: view.x + dx, y: view.y + dy } : view;
}

// Snap the dragged anchor; move a multi-selection by the same offset to preserve its layout.
export function snapDraggedNodes(nodes, anchorId, selectedIds) {
    const anchor = nodes.find(node => node.id === anchorId);
    if (!anchor) return nodes;
    const dx = Math.round(anchor.x / GRID_SIZE) * GRID_SIZE - anchor.x;
    const dy = Math.round(anchor.y / GRID_SIZE) * GRID_SIZE - anchor.y;
    if (!dx && !dy) return nodes;
    const ids = selectedIds.has(anchorId) ? selectedIds : new Set([anchorId]);
    return nodes.map(node => ids.has(node.id) ? { ...node, x: node.x + dx, y: node.y + dy } : node);
}

export function getMinimapProjection(nodes, view, viewport, width = 240, height = 150) {
    const visible = {
        left: -view.x / view.zoom,
        top: -view.y / view.zoom,
        right: (viewport.width - view.x) / view.zoom,
        bottom: (viewport.height - view.y) / view.zoom,
    };
    const bounds = getNodeBounds(nodes) || visible;
    const left = Math.min(bounds.left, visible.left);
    const top = Math.min(bounds.top, visible.top);
    const worldWidth = Math.max(1, Math.max(bounds.right, visible.right) - left);
    const worldHeight = Math.max(1, Math.max(bounds.bottom, visible.bottom) - top);
    const scale = Math.min((width - 24) / worldWidth, (height - 24) / worldHeight);
    return {
        scale,
        x: (width - worldWidth * scale) / 2 - left * scale,
        y: (height - worldHeight * scale) / 2 - top * scale,
    };
}
