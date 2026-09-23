export function centeredCrop(width, height, ratio) {
    if (!ratio) return { x: 0, y: 0, width, height };
    const w = Math.min(width, height * ratio), h = w / ratio;
    return { x: Math.round((width - w) / 2), y: Math.round((height - h) / 2), width: Math.floor(w), height: Math.floor(h) };
}
export function dragCrop(start, dx, dy, handle, bounds, ratio = 0) {
    const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
    if (handle === 'move') return { ...start, x: Math.round(clamp(start.x + dx, 0, bounds.width - start.width)), y: Math.round(clamp(start.y + dy, 0, bounds.height - start.height)) };
    let left = start.x, top = start.y, right = start.x + start.width, bottom = start.y + start.height;
    if (handle.includes('w')) left = clamp(left + dx, 0, right - 1);
    if (handle.includes('e')) right = clamp(right + dx, left + 1, bounds.width);
    if (handle.includes('n')) top = clamp(top + dy, 0, bottom - 1);
    if (handle.includes('s')) bottom = clamp(bottom + dy, top + 1, bounds.height);
    if (ratio) {
        let w = right - left, h = bottom - top;
        if (handle === 'n' || handle === 's') w = h * ratio; else h = w / ratio;
        const maxW = handle.includes('w') ? start.x + start.width : bounds.width - left;
        const maxH = handle.includes('n') ? start.y + start.height : bounds.height - top;
        const scale = Math.min(1, maxW / w, maxH / h); w *= scale; h *= scale;
        if (handle.includes('w')) left = start.x + start.width - w;
        if (handle.includes('n')) top = start.y + start.height - h;
        right = left + w; bottom = top + h;
    }
    const width = Math.max(1, Math.floor(right - left)), height = Math.max(1, Math.floor(bottom - top));
    return { x: clamp(Math.round(left), 0, bounds.width - width), y: clamp(Math.round(top), 0, bounds.height - height), width, height };
}
