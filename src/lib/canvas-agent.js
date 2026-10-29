import { connectNodeSources, NODE_DEFINITIONS, nodeText, nodeMedia } from './node-io';
import { modelSelectionPatch, modelsForNode, modelOptions } from './generation-models';
import { workflowInsertionPoint } from './workflow-groups';

const editable = new Set(['text-node', 'gen-image', 'gen-video', 'storyboard-node', 'video-timeline']);
const publicFields = ['title', 'prompt', 'text', 'model', 'ratio', 'resolution', 'duration', 'reference_ids'];

export function canvasMessageReference(node, connections, history = []) {
    const media = nodeMedia(node, value => value, history);
    return { node_id:node.id, title:node.title || NODE_DEFINITIONS[node.type]?.name || '节点', type:node.type,
        version:agentNodeVersion(node, connections), text:nodeText(node).join('\n').slice(0,8000),
        prompt:String(node.settings?.videoPrompt ?? node.settings?.prompt ?? '').slice(0,8000),
        media_types:[...new Set(media.map(item => item.type))], preview_url:media.find(item => item.type === 'image')?.url || '',
        preview_video_url:media.find(item => item.type === 'video')?.url || '',
    };
}

export function messageReferencePayload(references) {
    return references.map(({node_id,title,type,version,text,prompt,media_types}) => ({node_id,title,type,version,text,prompt,media_types}));
}

// Conflict token, not an authorization token. Ignore drag/selection and transient job progress.
export function agentNodeVersion(node, connections) {
    const s = node.settings || {};
    const value = JSON.stringify([node.type, node.title, node.content,
        s.text, s.richText, s.prompt, s.videoPrompt, s.model, s.ratio, s.resolution, s.duration,
        s.customParams, s.referenceImages, s.promptReferences, s.mode, s.workflowStage, s.shots, s.clips,
        connections.filter(c => c.to === node.id).map(c => [c.from, c.inputType || 'default']).sort()]);
    let a = 2166136261, b = 5381;
    for (let i = 0; i < value.length; i++) { a = Math.imul(a ^ value.charCodeAt(i), 16777619); b = Math.imul(b, 33) ^ value.charCodeAt(i); }
    return `${(a >>> 0).toString(16)}-${(b >>> 0).toString(16)}`;
}

export function canvasAgentContext(nodes, connections, selectedIds, models) {
    const selection = [...selectedIds].filter(id => nodes.some(node => node.id === id));
    const ordered = [...selection.map(id => nodes.find(n => n.id === id)), ...nodes.filter(n => !selection.includes(n.id))];
    return {
        selection, total_nodes: nodes.length, truncated: ordered.length > 150,
        nodes: ordered.slice(0, 150).map(node => ({ id: node.id, title: node.title || NODE_DEFINITIONS[node.type]?.name || '节点',
            type: node.type, editable: editable.has(node.type), version: agentNodeVersion(node, connections),
            text: nodeText(node).join('\n').slice(0, 8000), prompt: String(node.settings?.videoPrompt ?? node.settings?.prompt ?? '').slice(0, 8000),
            model: node.settings?.model || '', ratio: node.settings?.ratio || '', resolution: node.settings?.resolution || '', duration: node.settings?.duration || '',
            reference_ids: connections.filter(c => c.to === node.id).map(c => c.from),
            references: connections.filter(c => c.to === node.id).map(c => ({ node_id: c.from, port: c.inputType || 'default' })),
            ...(node.type === 'storyboard-node' ? { stage: node.settings?.workflowStage || node.settings?.mode,
                shots: (node.settings?.shots || []).map(shot => ({id:shot.id,title:shot.title,prompt:shot.prompt,model:shot.model,ratio:shot.ratio,resolution:shot.resolution,duration:shot.duration,dialogue:shot.dialogue,sound:shot.sound,
                    confirmed:Boolean(shot.outputEnabled),has_result:Boolean(shot.output_url || shot.output_images?.length),image_source:shot.imageSource})) } : {}),
            media: nodeMedia(node).map(item => ({ type: item.type, available: Boolean(item.url) })),
        })),
        models: models.filter(m => ['image.generate','image.edit','video.generate','text.generate'].includes(m.platformOperation)).map(m => ({
            id: m.id, name: m.displayName || m.name, operation: m.platformOperation, inputs: m.inputs,
            parameters: (m.customParams || []).map(p => ({ name: p.name, values: p.values, min: p.min, max: p.max, default: p.defaultValue })),
        })),
    };
}

export function applyAgentPatch(nodes, connections, action, models, center = { x: 0, y: 0 }) {
    const patches = action.arguments.nodes;
    if (!Array.isArray(patches) || !patches.length || patches.length > 12) throw new Error('画布修改格式无效');
    let nextNodes = [...nodes], nextConnections = [...connections];
    const touched = [], seen = new Set();
    for (const [index, patch] of patches.entries()) {
        if (Object.keys(patch).some(k => ![...publicFields, 'id', 'expected_version', 'type'].includes(k))) throw new Error('修改包含未开放字段');
        const id = patch.id || `agent-${action.id}-${index}`;
        if (seen.has(id)) throw new Error('同一批修改不能重复指定节点');
        seen.add(id);
        const previous = nextNodes.find(n => n.id === id);
        if (previous?.settings?.agentActions?.includes(action.id)) { touched.push(id); continue; }
        if (patch.id && !previous) throw new Error('节点已删除，请重新读取画布');
        if (previous && (!editable.has(previous.type) || (patch.type && patch.type !== previous.type))) throw new Error('此节点暂不支持对话修改');
        if (previous && agentNodeVersion(previous, connections) !== patch.expected_version) throw new Error('节点已被修改，请重新读取画布后再操作');
        if (!previous && !editable.has(patch.type)) throw new Error('尚未开放此节点类型');
        const type = previous?.type || patch.type;
        const width = type === 'text-node' ? 320 : 400, height = type === 'text-node' ? 200 : 280;
        const position = previous || workflowInsertionPoint([{ x: 0, y: 0, width, height }], nextNodes, center);
        let node = previous ? { ...previous, settings: { ...previous.settings } }
            : { id, type, x: position.x, y: position.y, width, height, settings: {} };
        if (patch.title !== undefined) node.title = patch.title;
        if (type === 'text-node') {
            if (patch.text !== undefined || patch.prompt !== undefined) {
                node.settings.text = patch.text ?? patch.prompt;
                delete node.settings.richText;
                node.content = node.settings.text;
            }
        } else if (type !== 'video-timeline') {
            const modelType = type === 'storyboard-node' ? (node.settings.mode === 'image' ? 'gen-image' : 'gen-video') : type;
            const available = modelsForNode(models, modelType);
            const model = available.find(m => (m._uid || m.id) === (patch.model || node.settings.model)) || (!patch.model && available[0]);
            if (patch.model && !model) throw new Error('当前模型不支持该节点，请重新选择');
            if (model && node.settings.model !== (model._uid || model.id)) node.settings = { ...node.settings, ...modelSelectionPatch(model, node.settings) };
            for (const field of ['ratio', 'resolution', 'duration']) {
                if (patch[field] === undefined) continue;
                const values = model ? modelOptions(model, field) : [];
                if (values.length && !values.includes(String(patch[field]))) throw new Error(`当前模型不支持 ${patch[field]}`);
                node.settings[field] = patch[field];
            }
            if (patch.prompt !== undefined) node.settings[modelType === 'gen-video' && type !== 'storyboard-node' ? 'videoPrompt' : 'prompt'] = patch.prompt;
            if (type === 'storyboard-node' && patch.model !== undefined && model) {
                node.settings.shots = (node.settings.shots || []).map(shot => ({...shot,...modelSelectionPatch(model,{...shot,
                    ratio:node.settings.ratio || shot.ratio,resolution:node.settings.resolution || shot.resolution,duration:shot.duration || node.settings.duration})}));
            }
        }
        if (patch.reference_ids !== undefined) {
            if (!Array.isArray(patch.reference_ids) || patch.reference_ids.length > 12) throw new Error('参考节点格式无效');
            const sources = [...new Set(patch.reference_ids)].map(source => nextNodes.find(n => n.id === source));
            if (sources.some(source => !source)) throw new Error('参考节点已不存在');
            const linked = connectNodeSources(nextConnections.filter(c => c.to !== id), sources, node);
            if (linked.error) throw new Error(linked.error);
            nextConnections = linked.connections;
            // Explicit replacement cannot leave invisible prompt references active.
            node.settings.promptReferences = [];
            node.settings.referenceImages = [];
        }
        node.settings.agentActions = [...(node.settings.agentActions || []), action.id].slice(-100);
        nextNodes = previous ? nextNodes.map(n => n.id === id ? node : n) : [...nextNodes, node];
        touched.push(id);
    }
    return { nodes: nextNodes, connections: nextConnections, touched,
        result: { applied: true, nodes: nextNodes.filter(n => touched.includes(n.id)).map(n => ({ id: n.id, title: n.title, version: agentNodeVersion(n, nextConnections) })) } };
}
