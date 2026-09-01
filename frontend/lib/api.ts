const BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';

export async function fetchAPI(endpoint: string, options: RequestInit = {}) {
    const url = `${BASE_URL}${endpoint}`;
    const response = await fetch(url, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...options.headers,
        },
    });

    if (!response.ok) {
        let errorMessage = `API Error: ${response.status} ${response.statusText}`;
        try {
            const errorData = await response.json();
            if (errorData.detail) {
                errorMessage = errorData.detail;
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

export const api = {
    get: (endpoint: string) => fetchAPI(endpoint, { method: 'GET' }),
    post: async (endpoint: string, body: any) => {
        const result = await fetchAPI(endpoint, { method: 'POST', body: JSON.stringify(body) });
        // Trigger usage refresh after successful POST (likely an AI generation)
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new Event('usage-updated'));
        }
        return result;
    },
    put: (endpoint: string, body: any) => fetchAPI(endpoint, { method: 'PUT', body: JSON.stringify(body) }),
    delete: (endpoint: string) => fetchAPI(endpoint, { method: 'DELETE' }),
    patch: (endpoint: string, body: any) => fetchAPI(endpoint, { method: 'PATCH', body: JSON.stringify(body) }),
};
