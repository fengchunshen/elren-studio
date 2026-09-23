const tokenPattern = /@\[([^\]]*)\]\(ref:([a-zA-Z0-9-]+)\)/g;
export const PROMPT_COMMANDS = [
    { id: 'nine-views', requiresImage: true, label: '多机位九宫格', text: '生成同一主体的 3×3 多机位九宫格，依次展示正面、左前、右前、左侧、右侧、背面、俯视、仰视和特写；保持主体外观一致。', kinds: ['image'] },
    { id: 'product', label: '产品摄影', text: '以参考产品为主体，保持结构、材质与标识一致，使用干净背景和柔和的摄影棚光线。', kinds: ['image'] },
    { id: 'camera', label: '缓慢推进', text: '镜头缓慢向主体推进，保持主体一致、运动连贯，避免突然切换机位。', kinds: ['video'] },
];
export function promptToken(reference) {
    return `@[${reference.label.replace(/[\]\n]/g, ' ')}](ref:${reference.id})`;
}
export function uniqueReferenceMedia(media) {
    const seen = new Set();
    return media.filter(item => {
        const key = JSON.stringify([item.type, item.role || 'reference', item.url]);
        if (seen.has(key)) return false;
        seen.add(key); return true;
    });
}
export function activePromptReferences(prompt, references = []) {
    const ids = [...String(prompt || '').matchAll(tokenPattern)].map(match => match[2]);
    return [...new Set(ids)].map(id => {
        const reference = references.find(item => item.id === id);
        if (!reference) throw new Error('提示词中的参考已丢失，请重新选择');
        return reference;
    });
}
export function resolvePromptReferences(prompt, references = []) {
    const active = activePromptReferences(prompt, references);
    const media = [], text = [];
    for (const [index, reference] of active.entries()) {
        if (!reference.resources?.length) throw new Error(`参考“${reference.label}”没有可用内容`);
        const label = `参考${index + 1}（${reference.label}）`;
        for (const resource of reference.resources) {
            if (resource.type === 'text' && resource.text?.trim()) text.push(`${label}：${resource.text}`);
            else if (resource.url && ['image', 'video', 'audio'].includes(resource.type)) media.push({ ...resource, role: reference.role || 'reference' });
            else throw new Error(`参考“${reference.label}”内容无效，请重新选择`);
        }
    }
    const resolved = String(prompt || '').replace(tokenPattern, (_, label, id) => `参考${active.findIndex(item => item.id === id) + 1}（${label}）`);
    return { prompt: [resolved, ...text].filter(Boolean).join('\n\n'), media };
}
