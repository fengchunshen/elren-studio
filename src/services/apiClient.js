export const nativeFetch = window.fetch.bind(window);
let csrf = '';
export function setCsrf(token) { csrf = token || ''; }
export async function api(path, { method = 'GET', body, headers = {}, ...options } = {}) {
    const form = body instanceof FormData;
    const response = await nativeFetch(`/api/v1${path}`, {
        ...options, method, credentials: 'same-origin',
        headers: { ...(body && !form ? {'Content-Type': 'application/json'} : {}), ...(method !== 'GET' ? {'X-CSRF-Token': csrf} : {}), ...headers },
        body: body ? form ? body : JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        const error = new Error(data.detail?.message || (typeof data.detail === 'string' ? data.detail : '请求失败'));
        error.code = data.detail?.code;
        error.status = response.status;
        if (response.status === 401 && !['/auth/login', '/auth/me'].includes(path)) window.dispatchEvent(new Event('platform:expired'));
        throw error;
    }
    return data;
}
