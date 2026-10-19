// 工作空间是入口页；画布只在 /canvas/<项目 ID> 下打开。
const CANVAS_PATH = /^\/canvas\/([^/]+)\/?$/;

export function canvasProjectId(pathname = window.location.pathname) {
    const match = CANVAS_PATH.exec(pathname);
    if (!match) return null;
    try { return decodeURIComponent(match[1]); } catch { return null; }
}

export const canvasPath = id => `/canvas/${encodeURIComponent(id)}`;
export const workspacePath = (create = false) => create ? '/?create=1' : '/';
