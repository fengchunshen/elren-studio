import { expect, it } from 'vitest';
import { nodeInspectorPosition } from '@/lib/node-inspector-position';

it('keeps the panel below a bottom-edge node and requests only enough pan to reveal it', () => {
    const node = { left: 515, right: 955, top: 180, bottom: 600, width: 440 };
    const layout = nodeInspectorPosition(node, 206, { width: 1470, height: 780 });
    expect(layout).toMatchObject({ left: 515, top: 612, width: 440, panY: -50 });
    expect(layout.top + layout.panY).toBe(node.bottom + layout.panY + 12);
    expect(layout.top + layout.panY + 206).toBe(768);
});

it('keeps a long panel scrollable below a visible part of its node on narrow screens', () => {
    const layout = nodeInspectorPosition({ left: -50, right: 390, top: -200, bottom: 720, width: 440 }, 900, { width: 390, height: 700 });
    expect(layout).toEqual({ left: 12, top: 732, width: 366, maxHeight: 524, panY: -568 });
    expect(720 + layout.panY).toBe(152);
    expect(layout.top + layout.panY + layout.maxHeight).toBe(688);
});

it('does not move the canvas when there is room and never flips sides as content grows', () => {
    const node = { left: 400, right: 840, top: 500, bottom: 700, width: 440 };
    const viewport = { width: 1280, height: 1000 };
    expect(nodeInspectorPosition(node, 240, viewport, 640)).toMatchObject({ top: 712, panY: 0 });
    expect(nodeInspectorPosition(node, 350, viewport, 640)).toMatchObject({ top: 712, panY: -74 });
});
