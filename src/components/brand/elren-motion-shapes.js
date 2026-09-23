// Deliberate silhouette key poses, following the reference's hold / transition
// rhythm. The outline is derived from the outer edges of elren-mark.svg.
const outline = 'M79 1 C97 1 114 6 129 16 L261 106 C285 120 298 140 298 165 C298 190 285 211 263 225 L120 310 C96 324 76 327 53 319 C21 309 1 283 1 249 C1 220 15 195 40 179 L84.5 155 L39 128 C17 114 8 94 8 71 C8 33 40 1 79 1 Z';

function outlinePoints(d) {
    const tokens = d.match(/[A-Z]|-?\d*\.?\d+/g);
    let i = 0, p = [0, 0];
    const points = [];
    const pair = () => [Number(tokens[i++]), Number(tokens[i++])];
    while (i < tokens.length) {
        const command = tokens[i++];
        if (command === 'M') { p = pair(); points.push(p); }
        else if (command === 'L') { p = pair(); points.push(p); }
        else if (command === 'C') {
            const a = pair(), b = pair(), end = pair(), start = p;
            for (let step = 1; step <= 24; step++) {
                const t = step / 24, u = 1 - t;
                points.push([0, 1].map(axis => u ** 3 * start[axis] + 3 * u ** 2 * t * a[axis] + 3 * u * t ** 2 * b[axis] + t ** 3 * end[axis]));
            }
            p = end;
        }
    }
    return points;
}

function resample(points, count = 96) {
    const lengths = points.map((p, i) => Math.hypot(...p.map((v, axis) => v - points[(i + 1) % points.length][axis])));
    const total = lengths.reduce((a, b) => a + b, 0);
    let segment = 0, traversed = 0;
    return Array.from({ length: count }, (_, i) => {
        const distance = total * i / count;
        while (segment < lengths.length - 1 && traversed + lengths[segment] < distance) traversed += lengths[segment++];
        const t = (distance - traversed) / (lengths[segment] || 1);
        return points[segment].map((v, axis) => v + (points[(segment + 1) % points.length][axis] - v) * t);
    });
}

function align(points, source) {
    let best = points, error = Infinity;
    for (let offset = 0; offset < points.length; offset++) {
        const candidate = points.map((_, i) => points[(i + offset) % points.length]);
        const distance = candidate.reduce((sum, p, i) => sum + p.reduce((s, v, axis) => s + (v - source[i][axis]) ** 2, 0), 0);
        if (distance < error) { best = candidate; error = distance; }
    }
    return best;
}

const pair = p => p.map(v => Number(v.toFixed(2))).join(' ');
function contour(points) {
    const n = points.length;
    return `M${pair(points[0])}` + points.map((p, i) => {
        const prev = points[(i + n - 1) % n], next = points[(i + 1) % n], after = points[(i + 2) % n];
        return `C${pair(p.map((v, axis) => v + (next[axis] - prev[axis]) / 6))} ${pair(next.map((v, axis) => v - (after[axis] - p[axis]) / 6))} ${pair(next)}`;
    }).join('') + 'Z';
}

const logo = resample(outlinePoints(outline));
const circle = align(Array.from({ length: 96 }, (_, i) => {
    const angle = -Math.PI / 2 + i / 96 * Math.PI * 2;
    return [150 + 120 * Math.cos(angle), 162 + 120 * Math.sin(angle)];
}), logo);
const square = align(resample(outlinePoints('M88 40 L212 40 C246.24 40 274 67.76 274 102 L274 222 C274 256.24 246.24 284 212 284 L88 284 C53.76 284 26 256.24 26 222 L26 102 C26 67.76 53.76 40 88 40 Z')), circle);
const turn = (points, degrees) => points.map(([x, y]) => {
    const angle = degrees * Math.PI / 180;
    return [150 + (x - 150) * Math.cos(angle) - (y - 162) * Math.sin(angle), 162 + (x - 150) * Math.sin(angle) + (y - 162) * Math.cos(angle)];
});

export const ELREN_MOTION_SHAPES = {
    logo: contour(logo),
    circle: contour(circle),
    square: contour(turn(square, -12)),
    squareTurn: contour(turn(square, 12)),
};
