import { getNodeBounds } from './canvas-viewport';

export function collectWorkflowGroups(nodes) {
    const groups = new Map();
    for (const node of nodes) {
        const group = node.workflowGroup;
        if (!group?.id || typeof group.name !== 'string') continue;
        if (!groups.has(group.id)) groups.set(group.id, { id: group.id, name: group.name, nodes: [] });
        groups.get(group.id).nodes.push(node);
    }
    return [...groups.values()].map(group => ({ ...group, bounds: getNodeBounds(group.nodes) }));
}

export function groupWorkflowNodes(nodes, ids, name, id = `group-${crypto.randomUUID()}`) {
    if (!name.trim()) throw new Error('请输入分组名称');
    const selected = new Set(ids);
    if (!nodes.some(node => selected.has(node.id))) throw new Error('请先选择节点');
    return nodes.map(node => selected.has(node.id) ? { ...node, workflowGroup: { id, name: name.trim() } } : node);
}

export function ungroupWorkflowNodes(nodes, id) {
    return nodes.map(node => {
        if (node.workflowGroup?.id !== id) return node;
        const { workflowGroup, ...rest } = node;
        return rest;
    });
}

// A cloned group must never retain the identity of the source group.
export function cloneWorkflowGroups(nodes) {
    const ids = new Map();
    return nodes.map(node => {
        if (!node.workflowGroup?.id) return node;
        if (!ids.has(node.workflowGroup.id)) ids.set(node.workflowGroup.id, `group-${crypto.randomUUID()}`);
        return { ...node, workflowGroup: { ...node.workflowGroup, id: ids.get(node.workflowGroup.id) } };
    });
}

export function workflowInsertionPoint(incoming, existing, preferred) {
    const bounds = getNodeBounds(incoming);
    if (!bounds || !existing.length) return preferred;
    const width = bounds.right - bounds.left, height = bounds.bottom - bounds.top;
    const left = preferred.x - width / 2, top = preferred.y - height / 2;
    const overlaps = existing.some(node => left - 80 < node.x + (node.width || 320) && left + width + 80 > node.x
        && top - 80 < node.y + (node.height || 240) && top + height + 80 > node.y);
    if (!overlaps) return preferred;
    const occupied = getNodeBounds(existing);
    return { x: occupied.right + 100 + width / 2, y: occupied.top + height / 2 };
}

// Keep a referenced node in the source's downstream column. Unrelated distant nodes
// must not push it to the global right edge of the canvas.
export function referencedNodeInsertionPoint(node, existing, preferred) {
    const width = node.width || 320, height = node.height || 240, gap = 80;
    const left = preferred.x - width / 2;
    const neighbors = existing.filter(item => left - gap < item.x + (item.width || 320) && left + width + gap > item.x);
    const candidates = [...new Set([preferred.y, ...neighbors.flatMap(item => [item.y + (item.height || 240) + gap + height / 2, item.y - gap - height / 2])])]
        .sort((a, b) => Math.abs(a - preferred.y) - Math.abs(b - preferred.y));
    const y = candidates.find(center => neighbors.every(item => center + height / 2 + gap <= item.y || center - height / 2 - gap >= item.y + (item.height || 240)));
    return { x: preferred.x, y: y ?? preferred.y };
}
