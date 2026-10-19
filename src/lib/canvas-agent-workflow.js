import { agentNodeVersion, applyAgentPatch } from './canvas-agent';
import { connectNodeSources, nodeMedia, NODE_DEFINITIONS } from './node-io';
import { modelsForNode, modelSelectionPatch, modelKey, modelOptions } from './generation-models';
import { workflowInsertionPoint } from './workflow-groups';
import { getNodeBounds } from './canvas-viewport';

const basic = ['text-node', 'gen-image', 'gen-video'];
const fields = ['key','type','title','id','expected_version','column','text','prompt','model','ratio','resolution','duration','stage','shots'];
const incoming = (id, links) => links.filter(edge => edge.to === id);

export function inspectWorkflow(nodes, connections, ids, models = []) {
    const selected = new Set(ids), errors = [], blockers = [];
    const map = new Map(nodes.map(node => [node.id, node]));
    const add = (list, node, code, message) => list.push({node_id:node?.id, title:node?.title, code, message});
    const links = connections.filter(edge => selected.has(edge.from) || selected.has(edge.to));
    for (const id of ids) {
        const node = map.get(id);
        if (!node) { add(errors,{id},'missing_node','工作流节点已不存在'); continue; }
        if (ids.length > 1 && !links.some(edge => edge.from === id || edge.to === id)) add(errors,node,'isolated_node','节点没有实际连线');
        const inputs = incoming(id, connections).map(edge => map.get(edge.from)).filter(Boolean);
        const stage = node.settings?.workflowStage || node.settings?.mode;
        const modelType = node.type === 'storyboard-node' ? (stage === 'image' ? 'gen-image' : 'gen-video') : node.type;
        if (['gen-image','gen-video','storyboard-node'].includes(node.type)) {
            const model = modelsForNode(models, modelType).find(model => modelKey(model) === node.settings?.model);
            if (!model) add(blockers,node,'missing_model','请为此阶段选择可用模型');
            else if (model.platformOperation === 'image.edit' && !inputs.some(source => nodeMedia(source).some(media => media.type === 'image'))
                && !node.settings?.referenceImages?.length && !node.settings?.promptReferences?.some(ref => ref.type === 'image'))
                add(blockers,node,'missing_reference_image','当前图片编辑模型需要可用参考图；可先完成上游视觉资产');
            for (const source of inputs) {
                if (NODE_DEFINITIONS[source.type]?.output.includes('image') && !nodeMedia(source).some(media => media.type === 'image'))
                    add(blockers,node,'waiting_source',`等待「${source.title || '上游节点'}」生成并确认画面`);
            }
        }
        if (node.type === 'storyboard-node') {
            const shots = node.settings?.shots || [];
            if (!shots.length) add(errors,node,'missing_shots','分镜没有镜头');
            for (const shot of shots) if (!modelsForNode(models,modelType).some(model => modelKey(model) === shot.model))
                add(blockers,node,'missing_shot_model',`「${shot.title || shot.id}」需要选择可用的${stage === 'image' ? '图片' : '视频'}模型`);
            if (stage === 'video') for (const shot of shots) {
                const source = map.get(shot.imageSource?.nodeId);
                const frame = source?.settings?.shots?.find(item => item.id === shot.imageSource?.shotId);
                if (!source || source.settings?.mode !== 'image' || !frame || !connections.some(edge => edge.from === source.id && edge.to === id))
                    add(errors,node,'invalid_shot_binding',`「${shot.title || shot.id}」缺少真实的对应图片分镜连线与镜头绑定`);
                else if (!frame.outputEnabled || !(frame.output_images?.[frame.selectedImageIndex >= 0 ? frame.selectedImageIndex : 0] || frame.output_url))
                    add(blockers,node,'unconfirmed_frame',`「${shot.title || shot.id}」等待对应分镜画面确认`);
            }
        }
        if (node.type === 'video-timeline' && !inputs.some(source => NODE_DEFINITIONS[source.type]?.output.includes('video')))
            add(errors,node,'missing_video_input','剪辑时间线未连接视频来源');
    }
    for (const edge of links) if (!map.has(edge.from) || !map.has(edge.to)) add(errors,map.get(edge.to),'dangling_edge','连线来源或目标已不存在');
    // Check dependencies, including paths through nodes outside this patch.
    const visiting = new Set(), visited = new Set();
    const visit = id => {
        if (visiting.has(id)) return true;
        if (visited.has(id)) return false;
        visiting.add(id);
        if (connections.filter(edge => edge.from === id).some(edge => visit(edge.to))) return true;
        visiting.delete(id); visited.add(id); return false;
    };
    if (ids.some(visit)) add(errors,null,'cycle','工作流存在循环依赖');
    return { structure_valid: !errors.length, ready: !errors.length && !blockers.length,
        node_count: ids.length, connection_count: links.length, errors, blockers,
        next_step: errors.length ? '修复结构后再完成' : blockers.length ? '结构已连接；按阶段补充参考、选择模型并确认画面' : '可以按阶段执行；尚未生成作品' };
}

export function applyAgentWorkflow(nodes, connections, action, models, center = {x:0,y:0}) {
    const plan = action.arguments;
    if (!plan.name?.trim() || !Array.isArray(plan.nodes) || plan.nodes.length < 2 || plan.nodes.length > 32 || !Array.isArray(plan.connections) || !plan.connections.length)
        throw new Error('工作流需要名称、节点与实际连线');
    const ids = new Map(), previousIds = new Set();
    for (const patch of plan.nodes) {
        if (Object.keys(patch).some(key => !fields.includes(key)) || !/^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/.test(patch.key) || ids.has(patch.key)) throw new Error('工作流节点格式或key无效');
        const id = patch.id || `agent-${action.id}-${patch.key}`;
        if (previousIds.has(id) || nodes.some(node => node.id === patch.key && node.id !== id)) throw new Error('工作流身份重复或key与已有节点冲突');
        previousIds.add(id); ids.set(patch.key,id);
    }
    const touched = [...ids.values()];
    const replayed = touched.every(id => nodes.find(node => node.id === id)?.settings?.agentActions?.includes(action.id));
    if (replayed) return {nodes,connections,touched,result:workflowResult(nodes,connections,touched,models,action.id)};
    let nextNodes = [...nodes], nextConnections = [...connections];
    const resolveId = key => ids.get(key) || key;
    const rows = new Map();
    for (const patch of plan.nodes) {
        const id = ids.get(patch.key), previous = nodes.find(node => node.id === id);
        if (patch.id && !previous) throw new Error('复用节点已不存在');
        if (previous && agentNodeVersion(previous,connections) !== patch.expected_version) throw new Error('节点已被修改，请重新读取画布');
        if (previous && previous.type !== patch.type) throw new Error('不能改变已有节点类型');
        let node;
        if (basic.includes(patch.type)) {
            const args = Object.fromEntries(Object.entries(patch).filter(([key]) => !['key','column','stage','shots'].includes(key)));
            // One-node helper retains model validation and preservation of old media.
            const tempAction = {id: `${action.id}-${patch.key}`, arguments:{nodes:[args]}};
            const changed = applyAgentPatch(nextNodes,nextConnections,tempAction,models,center);
            node = changed.nodes.find(item => item.id === changed.touched[0]);
            node = {...node,id,settings:{...node.settings}};
        } else if (['storyboard-node','video-timeline'].includes(patch.type)) {
            node = previous ? {...previous,settings:{...previous.settings}} : {id,type:patch.type,settings:{}};
            if (patch.title !== undefined) node.title = patch.title;
            if (patch.type === 'storyboard-node') {
                const stage = patch.stage || previous?.settings?.mode;
                if (!['image','video'].includes(stage) || (!previous && !patch.shots?.length) || (patch.shots && (!patch.shots.length || patch.shots.length > 24))) throw new Error('分镜需要有效阶段与镜头');
                if (previous && previous.settings?.mode !== stage) throw new Error('不能改变已有分镜的制作阶段');
                const modelType = stage === 'image' ? 'gen-image' : 'gen-video';
                const available = modelsForNode(models,modelType);
                const chosen = available.find(model => modelKey(model) === (patch.model || node.settings.model)) || (!patch.model && available[0]);
                if (patch.model && !chosen) throw new Error('当前模型不支持该制作阶段');
                if (chosen && node.settings.model !== modelKey(chosen)) node.settings = {...node.settings,...modelSelectionPatch(chosen,node.settings)};
                for (const field of ['ratio','resolution','duration']) {
                    if (patch[field] === undefined) continue;
                    const choices = chosen ? modelOptions(chosen,field) : [];
                    if (choices.length && !choices.includes(String(patch[field]))) throw new Error(`当前模型不支持 ${patch[field]}`);
                    node.settings[field] = patch[field];
                }
                const shotIds = new Set();
                if (patch.shots) node.settings.shots = patch.shots.map(shot => {
                    if (!shot.id || !shot.title || !shot.prompt || shotIds.has(shot.id) || Object.keys(shot).some(key => !['id','title','prompt','duration','dialogue','sound','image_source'].includes(key))) throw new Error('镜头内容或身份无效');
                    shotIds.add(shot.id);
                    const old = previous?.settings?.shots?.find(item => item.id === shot.id);
                    const {image_source,...content} = shot;
                    if (stage === 'video' && !image_source) throw new Error('视频镜头需要对应的分镜画面');
                    const bindingChanged = image_source && (old?.imageSource?.nodeId !== resolveId(image_source.node_key) || old?.imageSource?.shotId !== image_source.shot_id);
                    const specs = chosen && (!old || patch.model !== undefined) ? modelSelectionPatch(chosen,{...node.settings,...old,duration:shot.duration || '5s'}) : {};
                    return {...(old || {status:'draft',outputEnabled:false,output_images:[],selectedImageIndex:-1,image_url:'',output_url:''}),...specs,...content,
                        description:shot.title,duration:shot.duration || '5s',
                        ...(old && (old.prompt !== shot.prompt || old.duration !== (shot.duration || '5s') || bindingChanged) ? {outputEnabled:false} : {}),
                        ...(image_source ? {imageSource:{nodeId:resolveId(image_source.node_key),shotId:image_source.shot_id}} : {})};
                });
                node.settings = {...node.settings,mode:stage,workflowStage:stage,viewMode:'cards',projectTitle:node.title || plan.name};
            } else node.settings = {...node.settings,clips:node.settings.clips || []};
        } else throw new Error('工作流节点类型尚未开放');
        const column = patch.column ?? 0;
        if (!Number.isInteger(column) || column < 0 || column > 8) throw new Error('工作流布局列无效');
        const y = rows.get(column) || 0, height = patch.type === 'storyboard-node' ? 750 : 320;
        rows.set(column,y + height + 130);
        node = {...node,x:column,y,width:patch.type === 'storyboard-node' ? 850 : patch.type === 'video-timeline' ? 620 : 380,
            height,workflowGroup:{id:`workflow-${action.id}`,name:plan.name.trim()},
            settings:{...node.settings,agentActions:[...(node.settings.agentActions || []),action.id].slice(-100)}};
        nextNodes = previous ? nextNodes.map(item => item.id === id ? node : item) : [...nextNodes,node];
    }
    // All nodes now exist: forward references are safe, capacity checks are atomic.
    const ports = new Map();
    for (const edge of plan.connections) {
        if (Object.keys(edge).some(key => !['source','target','port'].includes(key))) throw new Error('连线字段无效');
        const source = resolveId(edge.source), target = resolveId(edge.target), port = edge.port || 'default';
        if (!touched.includes(target)) throw new Error('连线只能写入本批工作流节点');
        const key = JSON.stringify([target,port]);
        if (!ports.has(key)) ports.set(key,{target,port,sources:[]});
        ports.get(key).sources.push(source);
    }
    for (const {target,port,sources} of ports.values()) {
        const targetNode = nextNodes.find(node => node.id === target);
        const sourceNodes = [...new Set([...sources,...incoming(target,nextConnections).filter(edge => (edge.inputType || 'default') === port).map(edge => edge.from)])]
            .map(id => nextNodes.find(node => node.id === id));
        if (sourceNodes.some(node => !node)) throw new Error('连线来源已不存在');
        const linked = connectNodeSources(nextConnections,sourceNodes,targetNode,port);
        if (linked.error) throw new Error(linked.error);
        nextConnections = linked.connections;
    }
    const report = inspectWorkflow(nextNodes,nextConnections,touched,models);
    if (!report.structure_valid) throw new Error(report.errors.map(error => error.message).join('；'));
    const columns = new Map();
    for (const node of nextNodes.filter(node => touched.includes(node.id))) columns.set(node.x,Math.max(columns.get(node.x) || 0,node.width));
    let left = 0;
    const offsets = new Map([...columns].sort(([a],[b]) => a-b).map(([column,width]) => {
        const x = left; left += width + 220; return [column,x];
    }));
    nextNodes = nextNodes.map(node => touched.includes(node.id) ? {...node,x:offsets.get(node.x)} : node);
    const added = nextNodes.filter(node => touched.includes(node.id));
    const bounds = getNodeBounds(added);
    const point = workflowInsertionPoint(added,nodes.filter(node => !touched.includes(node.id)),center);
    const dx = point.x - (bounds.left + bounds.right)/2, dy = point.y - (bounds.top + bounds.bottom)/2;
    nextNodes = nextNodes.map(node => touched.includes(node.id) ? {...node,x:node.x+dx,y:node.y+dy} : node);
    return {nodes:nextNodes,connections:nextConnections,touched,result:workflowResult(nextNodes,nextConnections,touched,models,action.id)};
}

function workflowResult(nodes,connections,ids,models,actionId) {
    return {applied:true,workflow_id:`workflow-${actionId}`,nodes:ids.map(id => {
        const node = nodes.find(item => item.id === id); return {id,title:node.title,version:agentNodeVersion(node,connections)};
    }),validation:inspectWorkflow(nodes,connections,ids,models)};
}
