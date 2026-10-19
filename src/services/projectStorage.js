import { getPlatformContext, platformEnabled } from './platformContext';
import { canvasProjectId } from '@/lib/project-route';
// Project navigation reloads the editor. Pin this instance to the project in its URL
// so a pending autosave cannot write into the next project during navigation.
const localProjectId = canvasProjectId();

function prefix() {
    if (!platformEnabled) {
        const id = localProjectId;
        return !id || id === 'local-default' ? '' : `elren:local:${id}:`;
    }
    const ctx = getPlatformContext();
    if (!ctx?.user || !ctx?.project) throw new Error('项目会话尚未就绪');
    return `elren:v2:${ctx.user.id}:${ctx.project.id}:`;
}
export const appStorage = {
    getItem: key => window.localStorage.getItem(prefix() + key),
    setItem: (key, value) => window.localStorage.setItem(prefix() + key, value),
    removeItem: key => window.localStorage.removeItem(prefix() + key),
};
export const databaseName = name => prefix() + name;
export function captureProjectStorage() {
    const capturedPrefix = prefix();
    return {
        getItem: key => window.localStorage.getItem(capturedPrefix + key),
        setItem: (key, value) => window.localStorage.setItem(capturedPrefix + key, value),
        removeItem: key => window.localStorage.removeItem(capturedPrefix + key),
        databaseName: name => capturedPrefix + name,
    };
}

export function sanitizeImportedProject(value) {
    if (Array.isArray(value)) return value.map(sanitizeImportedProject);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value)
        .filter(([key]) => !['apiKey', 'globalApiKey', 'key', 'providers', 'apiConfigs', 'apiConfig', 'platformTaskId', 'billing'].includes(key))
        .map(([key, item]) => [key, sanitizeImportedProject(item)]));
}
