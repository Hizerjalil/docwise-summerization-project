import { API_BASE_URL, KEY_TOKEN } from './config.js';

function getHeaders() {
    const token = localStorage.getItem(KEY_TOKEN);
    return {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
    };
}

export async function request(endpoint, options = {}) {
    try {
        const res = await fetch(`${API_BASE_URL}${endpoint}`, {
            ...options,
            headers: {
                ...getHeaders(),
                ...options.headers
            }
        });

        const text = await res.text();
        let data;
        try {
            data = text ? JSON.parse(text) : {};
        } catch (err) {
            console.error('Invalid JSON response:', text);
            throw new Error(`Server returned invalid response (Status: ${res.status}). Please ensure the backend is running.`);
        }

        if (!res.ok) {
            const errorMessage = typeof data.error === 'string' ? data.error : (data.message || `Error ${res.status}`);
            
            if (res.status === 401 || res.status === 403) {
                console.warn('Auth error detected, clearing token...');
                localStorage.removeItem(KEY_TOKEN);
                setTimeout(() => window.location.href = 'sign.html', 1500);
                throw new Error('Session expired. Redirecting to login...');
            }
            
            throw new Error(errorMessage);
        }
        return data;
    } catch (err) {
        if (err.message === 'Failed to fetch' || err.name === 'TypeError') {
            throw new Error(`Connection failed. Ensure backend is running on port 5001. Error: ${err.message}`);
        }
        throw err;
    }
}

// Auth API
export const apiRegister = (userData) => request('/auth/register', {
    method: 'POST',
    body: JSON.stringify(userData)
});

export const apiLogin = (credentials) => request('/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials)
});

export const apiForgotPassword = (email) => request('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email })
});

export const apiResetPassword = (data) => request('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify(data)
});

// Summaries API
export const apiGetSummaries = () => request('/summaries');
export const apiGetSummaryById = (id) => request(`/summaries/${id}`);

export const apiSaveSummary = (summaryData) => request('/summaries', {
    method: 'POST',
    body: JSON.stringify(summaryData)
});

export const apiDeleteSummary = (id) => request(`/summaries/${id}`, {
    method: 'DELETE'
});

export const apiSummarize = (data) => {
    const isFormData = data instanceof FormData;
    const token = localStorage.getItem(KEY_TOKEN);
    
    const headers = {
        'Authorization': token ? `Bearer ${token}` : ''
    };
    if (!isFormData) headers['Content-Type'] = 'application/json';

    return fetch(`${API_BASE_URL}/summaries/summarize`, {
        method: 'POST',
        headers,
        body: isFormData ? data : JSON.stringify(data)
    }).then(async res => {
        const text = await res.text();
        let result;
        try {
            result = text ? JSON.parse(text) : {};
        } catch (err) {
            console.error('Summarization invalid JSON:', text);
            throw new Error(`Server error (${res.status}). The document might be too large or invalid.`);
        }
        
        if (!res.ok) {
            if (res.status === 401 || res.status === 403) {
                localStorage.removeItem(KEY_TOKEN);
                setTimeout(() => window.location.href = 'sign.html', 1500);
                throw new Error('Authentication invalid. Redirecting to login...');
            }
            throw new Error(result.error || 'Summarization failed');
        }
        return result;
    }).catch(err => {
        console.error('Fetch error during summarization:', err);
        if (err.message.includes('Authentication invalid') || err.message.includes('Session expired')) throw err;
        throw new Error(`Network error: ${err.message}`);
    });
};

