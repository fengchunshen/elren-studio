import React, { useEffect, useState } from 'react';

function ElapsedTime({ startTime }) {
    const [now, setNow] = useState(Date.now);
    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, [startTime]);
    const seconds = Math.max(0, Math.floor((now - startTime) / 1000));
    const elapsed = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    return <span className="generation-status__elapsed" aria-label={`已等待 ${elapsed}`}>{elapsed}</span>;
}

export function GenerationStatus({ task, hasMedia, video }) {
    return <div className={`generation-status ${hasMedia ? 'generation-status--overlay' : 'generation-status--empty'}`}>
        <div className="generation-status__label" role="status">
            <span className="generation-status__spinner" aria-hidden="true" />
            <span>{hasMedia ? (video ? '正在生成新视频' : '正在生成新图片') : (video ? '视频生成中' : '图片生成中')}</span>
        </div>
        {typeof task.startTime === 'number' && Number.isFinite(task.startTime) && task.startTime > 0 && <ElapsedTime startTime={task.startTime} />}
        {hasMedia && <p className="generation-status__detail">当前显示上次结果</p>}
        {task.errorMsg && <p className="generation-status__detail">{task.errorMsg}</p>}
    </div>;
}
