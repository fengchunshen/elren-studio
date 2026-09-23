export function loadImage(url) {
    return new Promise((resolve, reject) => {
        const image = new Image(); image.crossOrigin = 'anonymous';
        image.onload = () => resolve(image); image.onerror = () => reject(new Error('图片读取失败，无法编辑'));
        image.src = url;
    });
}
export function splitRectangles(width, height, grid) {
    if (![2, 3, 4].includes(grid) || width < grid || height < grid) throw new Error('切分规格或图片尺寸无效');
    return Array.from({ length: grid * grid }, (_, index) => {
        const col = index % grid, row = Math.floor(index / grid);
        const x = Math.floor(col * width / grid), y = Math.floor(row * height / grid);
        return { x, y, width: Math.floor((col + 1) * width / grid) - x, height: Math.floor((row + 1) * height / grid) - y };
    });
}
export function validImageSize(width, height) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 8192 || height > 8192 || width * height > 33554432) throw new Error('尺寸需为正整数，单边不超过 8192，合计不超过 3200 万像素');
}
export async function processImage(url, operation, settings = {}) {
    const source = await loadImage(url);
    let rectangles = [{ x: 0, y: 0, width: source.naturalWidth, height: source.naturalHeight }];
    if (operation === 'split') rectangles = splitRectangles(source.naturalWidth, source.naturalHeight, Number(settings.grid || 3));
    if (operation === 'crop') {
        const x = Number(settings.x || 0), y = Number(settings.y || 0), width = Number(settings.width || source.naturalWidth), height = Number(settings.height || source.naturalHeight);
        validImageSize(width, height);
        if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x + width > source.naturalWidth || y + height > source.naturalHeight) throw new Error('裁剪区域超出图片范围');
        rectangles = [{ x, y, width, height }];
    }
    return rectangles.map(rect => {
        const canvas = document.createElement('canvas');
        canvas.width = operation === 'resize' ? Number(settings.width || source.naturalWidth) : rect.width;
        canvas.height = operation === 'resize' ? Number(settings.height || source.naturalHeight) : rect.height;
        validImageSize(canvas.width, canvas.height);
        canvas.getContext('2d').drawImage(source, rect.x, rect.y, rect.width, rect.height, 0, 0, canvas.width, canvas.height);
        return { url: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height };
    });
}

export async function renderImageDocument(value, canvas, resolve = value => value) {
    validImageSize(value.width, value.height);
    canvas.width = value.width; canvas.height = value.height;
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (value.background && value.background !== 'transparent') { context.fillStyle = value.background; context.fillRect(0, 0, canvas.width, canvas.height); }
    for (const layer of value.layers || []) {
        context.save(); context.globalAlpha = layer.opacity ?? 1;
        if (layer.type === 'image') { const image = await loadImage(await resolve(layer.url)); context.drawImage(image, layer.x || 0, layer.y || 0, layer.width || image.naturalWidth, layer.height || image.naturalHeight); }
        if (layer.type === 'rectangle') { context.strokeStyle = layer.color; context.lineWidth = layer.lineWidth || 3; context.strokeRect(layer.x, layer.y, layer.width, layer.height); }
        if (layer.type === 'text') { context.fillStyle = layer.color; context.font = `${layer.size || 32}px sans-serif`; context.textBaseline = 'top'; context.fillText(layer.text, layer.x, layer.y); }
        if (layer.type === 'stroke') { context.strokeStyle = layer.color; context.lineWidth = layer.lineWidth || 3; context.lineCap = 'round'; context.lineJoin = 'round'; context.beginPath(); (layer.points || []).forEach(([x, y], index) => index ? context.lineTo(x, y) : context.moveTo(x, y)); context.stroke(); }
        context.restore();
    }
    return canvas.toDataURL('image/png');
}
