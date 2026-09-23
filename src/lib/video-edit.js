export const TARGET_OPERATIONS = ['video.replace', 'video.remove'];
export const STRUCTURED_VIDEO_OPERATIONS = [...TARGET_OPERATIONS, 'video.retake', 'video.extend'];
export function videoEditRequest(operation, settings, media) {
    const sources = media.filter(item => item.type === 'video' && item.role !== 'frame');
    if (sources.length !== 1) throw new Error('请选择一个原始视频');
    const references = [{ ...sources[0], role: 'source' }];
    if (!STRUCTURED_VIDEO_OPERATIONS.includes(operation)) return { references: [...references, ...media.filter(item => item.type !== 'video').map(item => ({ ...item, role: 'reference' }))] };
    const duration = settings.videoSourceDuration;
    if (!Number.isFinite(duration) || duration <= 0 || settings.videoSourceUrl !== sources[0].url) throw new Error('请先加载当前原片并编辑镜头');
    const videoEdit = { version: 1, source_duration: duration };
    if (TARGET_OPERATIONS.includes(operation)) {
        const target = settings.videoTarget;
        if (!target?.frame || !Number.isFinite(target.time) || target.time < 0 || target.time >= duration || !target.box) throw new Error('请选帧并圈选需要处理的对象');
        const { x, y, width, height } = target.box;
        if (![x, y, width, height].every(Number.isFinite) || x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 1.000001 || y + height > 1.000001) throw new Error('对象选区超出画面');
        videoEdit.target = { time: target.time, box: { x, y, width, height } };
        references.push({ type: 'image', url: target.frame, role: 'target_frame' });
        if (operation === 'video.replace') {
            const replacement = media.find(item => item.type === 'image' && item.url === settings.replacementUrl);
            if (!replacement) throw new Error('请选择替换图片');
            references.push({ ...replacement, role: 'replacement' });
        }
    } else if (operation === 'video.retake') {
        const shots = settings.retakeShots || [];
        if (!shots.length || shots.length > 20) throw new Error('请添加 1–20 个重拍片段');
        let lastEnd = 0;
        for (const shot of shots) {
            if (![shot.start, shot.end].every(Number.isFinite) || shot.start < lastEnd || shot.end <= shot.start || shot.end > duration || !shot.prompt?.trim()) throw new Error('重拍片段需要有效范围和描述，按时间排列且不能重叠');
            lastEnd = shot.end;
        }
        videoEdit.shots = shots.map(({ start, end, camera, framing, motion, prompt }) => ({ start, end, camera, framing, motion, prompt }));
    } else {
        const extension = settings.videoExtension || { direction: 'after', duration: 5 };
        if (!['before', 'after'].includes(extension.direction) || !Number.isFinite(extension.duration) || extension.duration <= 0 || extension.duration > 60) throw new Error('请选择延长方向和 0–60 秒内的时长');
        videoEdit.extension = extension;
    }
    return { references, videoEdit };
}
