import { api } from './apiClient';
import { getPlatformContext } from './platformContext';
import { uploadAsset } from './taskService';

const watchers = new Map();
export function watchMediaJob(id) {
    if (watchers.has(id)) return watchers.get(id);
    const promise = (async () => {
        for (;;) {
            let job;
            try { job = await api(`/media-jobs/${id}`); }
            catch (error) { if ([401, 403, 404].includes(error.status)) throw error; await new Promise(resolve => setTimeout(resolve, 5000)); continue; }
            window.dispatchEvent(new CustomEvent('platform:media-job', { detail: job }));
            if (['succeeded', 'failed', 'canceled'].includes(job.status)) return job;
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    })().finally(() => watchers.delete(id));
    watchers.set(id, promise);
    return promise;
}

export async function renderTimeline(clips, size = '1280x720', operation = 'concat', resolveMedia = async url => url) {
    const [width, height] = size.split('x').map(Number);
    const uploaded = new Map(), input = [];
    for (const clip of clips) {
        if (!uploaded.has(clip.url)) uploaded.set(clip.url, await uploadAsset(await resolveMedia(clip.url), 'clip.mp4'));
        input.push({ asset_id: uploaded.get(clip.url).id, start: Number(clip.start || 0), end: clip.end === '' || clip.end == null ? null : Number(clip.end) });
    }
    const body = { project_id: getPlatformContext().project.id, clips: input, width, height, operation }, key = crypto.randomUUID();
    for (let attempt = 0; attempt < 3; attempt++) {
        try { return await api('/media-jobs', { method: 'POST', body, headers: { 'Idempotency-Key': key } }); }
        catch (error) { if (error.status && error.status < 500 || attempt === 2) throw error; }
    }
}
