import { expect, it } from 'vitest';
import { splitRectangles, validImageSize } from '@/lib/image-processing';
it('splits odd-sized images without dropping any edge pixels', () => {
    for (const grid of [2, 3, 4]) {
        const rectangles = splitRectangles(1001, 777, grid);
        expect(rectangles).toHaveLength(grid * grid);
        expect(rectangles.reduce((sum, rect) => sum + rect.width * rect.height, 0)).toBe(1001 * 777);
        expect(rectangles.at(-1).x + rectangles.at(-1).width).toBe(1001);
        expect(rectangles.at(-1).y + rectangles.at(-1).height).toBe(777);
    }
    expect(() => validImageSize(-1, 500)).toThrow();
    expect(() => validImageSize(0, 500)).toThrow();
});
