const isStandalone = window.location.port !== '5001';
export const API_BASE_URL = isStandalone ? 'http://127.0.0.1:5001/api' : '/api';

export const KEY_TOKEN = 'docwise_token';
export const KEY_USER = 'docwise_user';
