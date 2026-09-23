export function captureVideoFrame(url, position = 0) {
    return new Promise((resolve, reject) => {
        const video = document.createElement('video'); video.crossOrigin = 'anonymous'; video.muted = true; video.preload = 'auto';
        const cleanup = () => { clearTimeout(timer); video.removeAttribute('src'); video.load(); };
        const fail = () => { cleanup(); reject(new Error('截帧失败，请检查视频能否播放')); };
        const timer = setTimeout(fail, 30000);
        const capture = () => {
            try { const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
                if (!canvas.width || !canvas.height) throw new Error('视频没有图像');
                canvas.getContext('2d').drawImage(video, 0, 0); const url = canvas.toDataURL('image/png'); cleanup(); resolve({ url, width: canvas.width, height: canvas.height });
            } catch { fail(); }
        };
        video.onerror = fail;
        video.onloadeddata = () => { video.onloadeddata = null; const time = position === 'last' ? Math.max(0, video.duration - 0.05) : Math.max(0, Math.min(Number(position), video.duration - 0.05)); if (time === 0) capture(); else { video.onseeked = capture; video.currentTime = time; } };
        video.src = url;
    });
}
