import { expect, it } from 'vitest';
import { ELREN_MOTION_SHAPES as shapes } from '@/components/brand/elren-motion-shapes';

const points = d => {
    const coordinates = d.match(/-?\d+(?:\.\d+)?/g).map(Number);
    const result = [coordinates.slice(0, 2)];
    for (let i = 2; i < coordinates.length - 6; i += 6) result.push(coordinates.slice(i + 4, i + 6));
    return result;
};
const cross = (a, b, p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
const intersects = (a, b, c, d) => cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0;

it('uses a true circle pose and matching closed contour topology', () => {
    const commands = Object.values(shapes).map(d => d.replace(/[^MCZ]/g, ''));
    expect(new Set(commands).size).toBe(1);
    for (const [x, y] of points(shapes.circle)) expect(Math.hypot(x - 150, y - 162)).toBeCloseTo(120, 1);
    for (const d of Object.values(shapes)) {
        const values = d.match(/-?\d+(?:\.\d+)?/g).map(Number);
        expect(values.slice(-2)).toEqual(values.slice(0, 2));
    }
});

it('keeps every transition as one simple outline without crossed edges', () => {
    const poses = [...Object.values(shapes), shapes.logo].map(points);
    for (let pose = 0; pose < poses.length - 1; pose++) {
        for (let frame = 0; frame <= 10; frame++) {
            const polygon = poses[pose].map((p, i) => p.map((value, axis) => value + (poses[pose + 1][i][axis] - value) * frame / 10));
            const n = polygon.length;
            for (let i = 0; i < n; i++) {
                for (let j = i + 2; j < n; j++) {
                    if (i === 0 && j === n - 1) continue;
                    expect(intersects(polygon[i], polygon[(i + 1) % n], polygon[j], polygon[(j + 1) % n])).toBe(false);
                }
            }
        }
    }
});
