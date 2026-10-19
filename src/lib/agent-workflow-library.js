import { NODE_DEFINITIONS } from './node-io';

// Original reusable structures distilled from the observed reference canvases.
// No provider IDs, copied creative assets or fabricated outputs in a recipe.
export const SHORT_DRAMA_BLUEPRINT = {
    name: '短剧制作 · 剧本到剪辑',
    nodes: [
        { key: 'script', type: 'text-node', column: 0, title: '01 剧本', text: '《门外的第二个我》\n夜，值班室。林夏刚锁好门，门外响起她自己的声音：“别开门。”\n镜头1：桌上手机亮起，一条来自自己的短信：门外不是我。\n镜头2：林夏抬头看向门缝，门外的影子抬起手。\n镜头3：林夏屏住呼吸；门内电话响起。\n结尾：电话里传来同一句“别开门”。' },
        { key: 'character', type: 'text-node', column: 1, title: '02 林夏 · 人物设定', text: '林夏，26岁，短黑发，深灰值班制服，左腕银色手表。动作克制、警觉。所有镜头保持发型、服装和手表位置一致。' },
        { key: 'scene', type: 'text-node', column: 1, title: '02 值班室 · 场景设定', text: '狭窄值班室，左侧木门，右侧桌面与座机，暖色台灯与门缝冷光。保持门、桌、灯的空间关系和人物视线轴线。' },
        { key: 'look', type: 'gen-image', column: 2, title: '03 林夏 · 定妆参考', prompt: '林夏全身定妆照，正面站立，自然平静表情，忠实遵守连接的人物描述，均匀柔光，中性背景，清楚展示服装与手表。' },
        { key: 'environment', type: 'gen-image', column: 2, title: '03 值班室 · 场景参考', prompt: '空镜，展示连接描述中的值班室，门、桌、座机和灯的位置清晰，建立可复用的空间与灯光，不出现人物。' },
        { key: 'frames', type: 'storyboard-node', stage: 'image', column: 3, title: '04 分镜画面 · 先确认构图', ratio: '9:16', shots: [
            { id: 'shot-01', title: '手机警告', duration: '5s', prompt: '手机与林夏左手的大特写，银色手表清晰，台灯暖光照亮桌面，门缝冷光位于背景左侧。短信文字后期添加。', sound: '短信提示音' },
            { id: 'shot-02', title: '门外影子', duration: '5s', prompt: '林夏背后的过肩中景，木门位于画面左侧，门缝外影子抬手；制服与发型匹配定妆参考，人物视线指向门。', dialogue: '门外：别开门。' },
            { id: 'shot-03', title: '电话响起', duration: '5s', prompt: '林夏面部近景，右侧前景座机，台灯暖光与门缝冷光交汇，紧绷表情，浅景深。', dialogue: '电话：别开门。' },
        ] },
        { key: 'motion', type: 'storyboard-node', stage: 'video', column: 4, title: '05 镜头动画 · 逐镜选片', ratio: '9:16', shots: [
            { id: 'shot-01', title: '手机警告', duration: '5s', prompt: '以确认画面为首帧，手机亮起，手指停住，缓慢推近；保持手表、桌面和灯光，预留后期短信叠字。', image_source: { node_key: 'frames', shot_id: 'shot-01' }, sound: '短信提示音' },
            { id: 'shot-02', title: '门外影子', duration: '5s', prompt: '以确认画面为首帧，林夏缓慢转头，门外影子抬手停住，镜头固定，保持人物与门的位置。', image_source: { node_key: 'frames', shot_id: 'shot-02' }, dialogue: '门外：别开门。' },
            { id: 'shot-03', title: '电话响起', duration: '5s', prompt: '以确认画面为首帧，座机响起，林夏的目光从门转到座机，轻微推近，结束时停在惊恐表情。', image_source: { node_key: 'frames', shot_id: 'shot-03' }, dialogue: '电话：别开门。' },
        ] },
        { key: 'edit', type: 'video-timeline', column: 5, title: '06 剪辑 · 选片与裁切' },
    ],
    connections: [
        { source: 'script', target: 'character' }, { source: 'script', target: 'scene' },
        { source: 'character', target: 'look' }, { source: 'scene', target: 'environment' },
        ...['script', 'character', 'scene', 'look', 'environment'].map(source => ({ source, target: 'frames' })),
        { source: 'frames', target: 'motion' }, { source: 'motion', target: 'edit' },
    ],
};

export function readWorkflowLibrary() {
    return {
        methodology: [
            '先把需求写成实际剧本或创作文案，固定人物、场景、服装、道具、轴线与灯光；文字助手可以直接写入。',
            '共享文字规则与参考素材通过真实连线传递，分镜明确景别、机位、构图、人物关系，按镜头拆分静态画面。',
            '定妆图/三视图是身份参考，分镜画面才是剧情首帧；动态镜头写动作、运镜、节奏和声音，不能拿人设板当剧情。',
            '先确认分镜图片，再生成对应视频；视频分镜按image_source绑定稳定镜头身份，未确认时阻止执行。',
            '选定视频才进入剪辑，复用已有时间线的裁切与去重；声音字幕记录在镜头，完整混音与字幕仍按后期交接。',
            '可先搭好等待素材的完整图，检查结构和执行阻塞分别报告，不把需要参考图当作不连接文字节点的理由。',
        ],
        recipes: [
            { id: 'short-drama', name: SHORT_DRAMA_BLUEPRINT.name, use: '短剧/叙事短片', blueprint: SHORT_DRAMA_BLUEPRINT },
            { id: 'reference-to-shots', name: '统一参考 → 多景别画面 → 动态镜头', use: '同一人物/场景的镜头变体', flow: ['已有图片', '分镜构图图片', '视频分镜', '剪辑'], rule: '九宫格作为预演参考；剧情视频仍按单镜构图确认与绑定。' },
            { id: 'shared-shot-rules', name: '故事 + 镜头规则 + 视觉参考 → 分镜 → 视频', use: '动作/电影镜头设计', flow: ['故事文本与视听规则', '人物与场景参考', '各镜静态画面', '动作与运镜', '剪辑'], rule: '共享约束实际汇入各镜，局部改稿只处理相关镜头。' },
        ],
        nodes: Object.entries(NODE_DEFINITIONS).filter(([type]) => ['text-node', 'gen-image', 'gen-video', 'storyboard-node', 'video-timeline'].includes(type))
            .map(([type, definition]) => ({ type, ...definition, inputs: Object.fromEntries(Object.entries(definition.inputs).map(([key, port]) => [key, { ...port, max: Number.isFinite(port.max) ? port.max : null }])) })),
        execution: 'apply_workflow只搭建与保存，不生成。inspect_workflow核对结构和阻塞；图片视频付费生成继续走用户确认。分镜逐镜生成、确认和时间线合片使用节点已有控件。',
    };
}
