const BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';

const TOKEN_KEY = 'sf_token';

export function getAuthToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token: string | null) {
    if (typeof window === 'undefined') return;
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
}

/** Auth header for the few places that use raw fetch (file upload, text download). */
export function getAuthHeaders(): Record<string, string> {
    const token = getAuthToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
}

function handleUnauthorized() {
    setAuthToken(null);
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        window.location.href = `${BASE_URL}/login`;
    }
}

export interface RequestOptions extends RequestInit {
    /** Abort the request after this many ms (guards against hung generations). */
    timeoutMs?: number;
}

export async function fetchAPI(endpoint: string, options: RequestOptions = {}) {
    const { timeoutMs, ...init } = options;
    const url = `${BASE_URL}${endpoint}`;

    // Combine any caller-provided signal with the optional timeout signal.
    const controller = new AbortController();
    const timeoutId = timeoutMs ? setTimeout(() => controller.abort(), timeoutMs) : null;
    if (init.signal) {
        if (init.signal.aborted) controller.abort();
        else init.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    let response: Response;
    try {
        response = await fetch(url, {
            ...init,
            signal: controller.signal,
            headers: {
                'Content-Type': 'application/json',
                ...getAuthHeaders(),
                ...init.headers,
            },
        });
    } catch (e: any) {
        if (e?.name === 'AbortError') {
            throw new Error(
                timeoutMs
                    ? `请求超时 (${Math.round(timeoutMs / 1000)}s)，后端可能仍在运行；请稍后在调试页确认`
                    : '请求已取消'
            );
        }
        throw e;
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
    }

    if (!response.ok) {
        if (response.status === 401) {
            handleUnauthorized();
        }
        let errorMessage = `API Error: ${response.status} ${response.statusText}`;
        try {
            const errorData = await response.json();
            if (errorData.detail) {
                errorMessage = typeof errorData.detail === 'string'
                    ? errorData.detail
                    : JSON.stringify(errorData.detail);
            } else if (errorData.message) {
                errorMessage = errorData.message;
            }
        } catch (e) {
            // response was not json, use default
        }
        throw new Error(errorMessage);
    }

    return response.json();
}

// Endpoints that trigger an LLM call (and thus change token usage).
const GENERATION_ENDPOINT_RE = /(\/generate|\/refine|\/analyze|\/polish|\/extract|\/generate-bible|\/parse|\/parse-file)/;

export const api = {
    get: (endpoint: string) => fetchAPI(endpoint, { method: 'GET' }),
    post: async (endpoint: string, body: any, options: RequestOptions = {}) => {
        const result = await fetchAPI(endpoint, { method: 'POST', body: JSON.stringify(body), ...options });
        // Trigger usage refresh after AI generation POSTs only (saves/settings don't consume tokens).
        if (typeof window !== 'undefined' && GENERATION_ENDPOINT_RE.test(endpoint)) {
            window.dispatchEvent(new Event('usage-updated'));
        }
        return result;
    },
    put: (endpoint: string, body: any) => fetchAPI(endpoint, { method: 'PUT', body: JSON.stringify(body) }),
    delete: (endpoint: string) => fetchAPI(endpoint, { method: 'DELETE' }),
    patch: (endpoint: string, body: any) => fetchAPI(endpoint, { method: 'PATCH', body: JSON.stringify(body) }),
};
