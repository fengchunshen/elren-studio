import { expect, it } from 'vitest';
import { fitCanvasView, revealCanvasNode, getMinimapProjection, snapDraggedNodes, zoomAtPoint } from '@/lib/canvas-viewport';

it('keeps the same world point under the zoom anchor, including zoom limits', () => {
    const view = { x: -320, y: 145, zoom: 0.8 };
    const anchor = { x: 720, y: 450 };
    for (const target of [0.01, 1, 1.1, 3, 8]) {
        const next = zoomAtPoint(view, target, anchor);
        expect((anchor.x - next.x) / next.zoom).toBeCloseTo((anchor.x - view.x) / view.zoom);
        expect((anchor.y - next.y) / next.zoom).toBeCloseTo((anchor.y - view.y) / view.zoom);
        expect(next.zoom).toBeGreaterThanOrEqual(0.2);
        expect(next.zoom).toBeLessThanOrEqual(3);
    }
});

it('fits negative and offscreen nodes without changing their layout and handles an empty canvas', () => {
    const nodes = [{ x: -600, y: -340, width: 300, height: 400 }, { x: 1600, y: 850, width: 400, height: 300 }];
    const viewport = { width: 1200, height: 800 };
    const view = fitCanvasView(nodes, viewport);
    for (const node of nodes) {
        expect(node.x * view.zoom + view.x).toBeGreaterThanOrEqual(63);
        expect(node.y * view.zoom + view.y).toBeGreaterThanOrEqual(63);
        expect((node.x + node.width) * view.zoom + view.x).toBeLessThanOrEqual(1137);
        expect((node.y + node.height) * view.zoom + view.y).toBeLessThanOrEqual(737);
    }
    expect(fitCanvasView([], viewport)).toEqual({ x: 0, y: 0, zoom: 1 });
});

it('snaps a group by its dragged anchor while preserving relative positions and unselected nodes', () => {
    const nodes = [{ id: 'a', x: -33, y: 48 }, { id: 'b', x: 102, y: 207 }, { id: 'c', x: 17, y: 18 }];
    const next = snapDraggedNodes(nodes, 'a', new Set(['a', 'b']));
    expect(next[0]).toEqual({ id: 'a', x: -40, y: 40 });
    expect(next[1].x - next[0].x).toBe(nodes[1].x - nodes[0].x);
    expect(next[1].y - next[0].y).toBe(nodes[1].y - nodes[0].y);
    expect(next[2]).toBe(nodes[2]);
    expect(nodes[0].x).toBe(-33);
});

it('maps all nodes and the viewport into the minimap using one uniform scale', () => {
    const nodes = [{ x: -2000, y: 1000, width: 400, height: 300 }];
    const view = { x: -900, y: 200, zoom: 0.5 };
    const viewport = { width: 1200, height: 800 };
    const map = getMinimapProjection(nodes, view, viewport);
    for (const point of [{ x: -2000, y: 1300 }, { x: -view.x / view.zoom, y: -view.y / view.zoom }, { x: (1200 - view.x) / view.zoom, y: (800 - view.y) / view.zoom }]) {
        expect(point.x * map.scale + map.x).toBeGreaterThanOrEqual(11.99);
        expect(point.x * map.scale + map.x).toBeLessThanOrEqual(228.01);
        expect(point.y * map.scale + map.y).toBeGreaterThanOrEqual(11.99);
        expect(point.y * map.scale + map.y).toBeLessThanOrEqual(138.01);
    }
});

it('reveals an offscreen new node with minimal panning and preserves the working zoom', () => {
    const viewport = { width: 1200, height: 800 };
    for (const zoom of [0.38, 0.75, 1, 1.5, 3]) {
        const view = { x: -250, y: 100, zoom };
        const node = { x: 2000, y: 150, width: 280, height: 200 };
        const next = revealCanvasNode(view, node, viewport);
        expect(next.zoom).toBe(zoom);
        expect(node.x * zoom + next.x).toBeGreaterThanOrEqual(24);
        expect((node.x + node.width) * zoom + next.x).toBeLessThanOrEqual(1176);
        expect(node.y * zoom + next.y).toBeGreaterThanOrEqual(72);
        expect((node.y + node.height) * zoom + next.y).toBeLessThanOrEqual(776);
    }
    const view = { x: 0, y: 0, zoom: 1 };
    expect(revealCanvasNode(view, { x: 100, y: 100, width: 280, height: 200 }, viewport)).toBe(view);
    expect(revealCanvasNode(view, { x: 1000, y: 100, width: 280, height: 200 }, viewport)).toEqual({ x: -104, y: 0, zoom: 1 });
});

it('keeps oversized nodes at their original zoom with the top and left available for editing', () => {
    const next = revealCanvasNode({ x: 0, y: 0, zoom: 2 }, { x: 200, y: 300, width: 900, height: 600 }, { width: 800, height: 600 });
    expect(next).toEqual({ x: -376, y: -528, zoom: 2 });
});
