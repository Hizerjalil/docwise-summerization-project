import { initAuth, checkAdminUI } from './auth.js';
import { initWork } from './summaries.js';
import { initLanding } from './landing.js';

// Global initialization
document.addEventListener('DOMContentLoaded', () => {
    initLanding();
    initAuth();
    initWork();
    checkAdminUI();
});
