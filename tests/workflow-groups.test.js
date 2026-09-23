import { expect, it } from 'vitest';
import { collectWorkflowGroups, groupWorkflowNodes, ungroupWorkflowNodes, workflowInsertionPoint, referencedNodeInsertionPoint } from '@/lib/workflow-groups';
import { instantiateWorkflow } from '@/lib/workspace-library';

it('round-trips group membership through JSON and gives copies independent identities with internal links', () => {
    const nodes = groupWorkflowNodes([
        { id: 'a', type: 'text-node', x: 0, y: 100, width: 300, height: 200 },
        { id: 'b', type: 'text-node', x: 400, y: 100, width: 300, height: 200 },
        { id: 'outside', type: 'text-node', x: 800, y: 100 },
    ], ['a', 'b'], '流程一', 'g1');
    const groups = collectWorkflowGroups(JSON.parse(JSON.stringify(nodes)));
    expect(groups).toHaveLength(1);
    expect(groups[0].bounds).toEqual({ left: 0, top: 100, right: 700, bottom: 300 });
    const workflow = { nodes: groups[0].nodes, connections: [{ from: 'a', to: 'b' }] };
    const copy = instantiateWorkflow(workflow, { x: 1500, y: 500 });
    expect(copy.nodes[0].workflowGroup.id).not.toBe('g1');
    expect(copy.nodes[0].workflowGroup.id).toBe(copy.nodes[1].workflowGroup.id);
    expect(copy.nodes[1].x - copy.nodes[0].x).toBe(400);
    expect(copy.connections[0]).toMatchObject({ from: copy.nodes[0].id, to: copy.nodes[1].id });
    const ungrouped = ungroupWorkflowNodes(nodes, 'g1');
    expect(ungrouped).toHaveLength(3);
    expect(collectWorkflowGroups(ungrouped)).toHaveLength(0);
    expect(ungrouped[0].x).toBe(0);
});

it('places a new workflow beside existing content instead of enclosing or covering unrelated nodes', () => {
    const incoming = [{ x: 0, y: 0, width: 700, height: 400 }];
    const existing = [{ x: 0, y: 0, width: 320, height: 200 }];
    expect(workflowInsertionPoint(incoming, existing, { x: 200, y: 200 })).toEqual({ x: 770, y: 200 });
    expect(workflowInsertionPoint(incoming, existing, { x: 2000, y: 200 })).toEqual({ x: 2000, y: 200 });
});

it('places referenced nodes near their source even with unrelated nodes far to the right', () => {
    const node = { width: 400, height: 300 };
    const preferred = { x: 740, y: 250 };
    const existing = [
        { x: 100, y: 150, width: 280, height: 200 },
        { x: 540, y: 100, width: 400, height: 300 },
        { x: 9000, y: -4000, width: 440, height: 250 },
    ];
    expect(referencedNodeInsertionPoint(node, existing, preferred)).toEqual({ x: 740, y: 630 });
    const next = referencedNodeInsertionPoint(node, [...existing, { x: 540, y: 480, width: 400, height: 300 }], preferred);
    expect(next).toEqual({ x: 740, y: -130 });
    expect(referencedNodeInsertionPoint(node, [existing[0], existing[2]], preferred)).toEqual(preferred);
});
