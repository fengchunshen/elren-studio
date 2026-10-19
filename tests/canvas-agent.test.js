import { describe, it, expect } from 'vitest';
import { agentNodeVersion, applyAgentPatch, canvasAgentContext, canvasMessageReference, messageReferencePayload } from '@/lib/canvas-agent';

const nodes = () => ['a','b','c'].map(id => ({ id, type:'text-node', title:'同名', x:0, y:0, width:280, height:200, settings:{text:id} }));
describe('canvas agent commands', () => {
    it('captures stable reference identity and content without sending preview URLs', () => {
        const original=nodes()[1];
        const reference=canvasMessageReference(original,[]);
        original.settings.text='后来修改';
        expect(reference.text).toBe('b');
        const payload=messageReferencePayload([{...reference,preview_url:'data:image/png;base64,private',missing:false}]);
        expect(payload[0].node_id).toBe('b');expect(payload[0].version).toBeTruthy();
        expect(JSON.stringify(payload)).not.toContain('base64');expect(payload[0].missing).toBeUndefined();
    });
    it('uses selected order and stable identities instead of matching duplicate titles', () => {
        const context = canvasAgentContext(nodes(), [], new Set(['c','b']), []);
        expect(context.selection).toEqual(['c','b']);
        expect(context.nodes.map(n => n.id)).toEqual(['c','b','a']);
    });
    it('applies a batch atomically, preserves unrelated content, and replays without duplication', () => {
        const original = nodes();
        const action = {id:'request-1',arguments:{nodes:[{id:'b',expected_version:agentNodeVersion(original[1],[]),text:'新版'}, {type:'text-node',text:'新内容'}]}};
        const result = applyAgentPatch(original,[],action,[]);
        expect(result.nodes[0]).toBe(original[0]);expect(result.nodes[1].settings.text).toBe('新版');
        expect(result.nodes).toHaveLength(4);
        expect(applyAgentPatch(result.nodes,result.connections,action,[]).nodes).toEqual(result.nodes);
        expect(original[1].settings.text).toBe('b');
    });
    it('rejects a stale second patch without partially committing the first', () => {
        const original = nodes();
        const action = {id:'stale',arguments:{nodes:[{id:'a',expected_version:agentNodeVersion(original[0],[]),text:'改动'}, {id:'b',expected_version:'old',text:'覆盖'}]}};
        expect(() => applyAgentPatch(original,[],action,[])).toThrow('节点已被修改');
        expect(original[0].settings.text).toBe('a');
    });
    it('cannot mutate node type or arbitrary settings and does not leak image bytes', () => {
        const original=nodes();original[0].content='data:image/png;base64,private';
        expect(() => applyAgentPatch(original,[],{id:'bad',arguments:{nodes:[{id:'a',expected_version:agentNodeVersion(original[0],[]),settings:{key:'x'}}]}},[])).toThrow();
        expect(JSON.stringify(canvasAgentContext(original,[],new Set(),[]))).not.toContain('base64');
    });
    it('rejects missing reference nodes instead of silently dropping them', () => {
        expect(() => applyAgentPatch(nodes(),[],{id:'missing',arguments:{nodes:[{type:'gen-image',reference_ids:['unknown']}] }},[])).toThrow('参考节点已不存在');
    });
});
