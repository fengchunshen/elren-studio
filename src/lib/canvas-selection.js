// Screen coordinates stay local to the canvas; node bounds are world coordinates.
export function selectNodesInMarquee(nodes, start, end, view, baseIds = []) {
    const left = (Math.min(start.x, end.x) - view.x) / view.zoom;
    const right = (Math.max(start.x, end.x) - view.x) / view.zoom;
    const top = (Math.min(start.y, end.y) - view.y) / view.zoom;
    const bottom = (Math.max(start.y, end.y) - view.y) / view.zoom;
    return new Set([...baseIds, ...nodes.filter(node =>
        node.x < right && node.x + (node.width || 260) > left &&
        node.y < bottom && node.y + (node.height || 200) > top
    ).map(node => node.id)]);
}
