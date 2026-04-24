import { apiRegister, apiLogin, apiForgotPassword, apiResetPassword } from './api.js';
import { showToast, openModal, closeModal } from './ui.js';
import { KEY_TOKEN, KEY_USER } from './config.js';

let resetEmail = '';

export function initAuth() {
    const regForm = document.getElementById('registerForm');
    const loginForm = document.getElementById('loginForm');

    if (!regForm && !loginForm) return;

    // Toggle logic
    document.getElementById('goToLogin')?.addEventListener('click', () => {
        regForm.style.display = 'none';
        loginForm.style.display = '';
    });

    document.getElementById('goToRegister')?.addEventListener('click', () => {
        loginForm.style.display = 'none';
        regForm.style.display = '';
    });

    // Password Visibility Toggle
    document.querySelectorAll('.toggle-btn').forEach(icon => {
        icon.addEventListener('click', function () {
            const input = document.getElementById(this.getAttribute('data-target'));
            if (!input) return;
            if (input.type === 'password') {
                input.type = 'text';
                this.classList.replace('fa-regular', 'fa-solid');
            } else {
                input.type = 'password';
                this.classList.replace('fa-solid', 'fa-regular');
            }
        });
    });

    // Register
    regForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('regUser').value.trim();
        const email = document.getElementById('regEmail').value.trim();
        const phone = document.getElementById('regPhone').value.trim();
        const password = document.getElementById('regPass').value;
        const conf = document.getElementById('regConf').value;

        if (password.length < 6) return showToast('Password too short!', 'error');
        if (password !== conf) return showToast('Passwords mismatch!', 'error');

        try {
            const data = await apiRegister({ username, email, phone, password });
            showToast(data.message, 'success');
            regForm.style.display = 'none';
            loginForm.style.display = 'block';
        } catch (err) {
            showToast(err.message, 'error');
        }
    });

    // Login
    loginForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('loginEmail').value.trim();
        const password = document.getElementById('loginPass').value;

        try {
            const data = await apiLogin({ email, password });
            localStorage.setItem(KEY_TOKEN, data.token);
            localStorage.setItem(KEY_USER, JSON.stringify(data.user));
            showToast('Welcome back!', 'success');
            setTimeout(() => window.location.href = 'work.html', 1500);
        } catch (err) {
            showToast(err.message, 'error');
        }
    });

    // Reset Password One-Step Flow
    document.getElementById('openForgotModal')?.addEventListener('click', () => {
        openModal('forgotModalOverlay');
    });
    document.getElementById('closeForgotModal')?.addEventListener('click', () => closeModal('forgotModalOverlay'));

    document.getElementById('resetPassBtn')?.addEventListener('click', async () => {
        const email = document.getElementById('resetEmail').value.trim();
        const newPassword = document.getElementById('resetNewPassword').value;
        const confirmPassword = document.getElementById('newConf').value;

        if (!email || !newPassword) return showToast('Please fill all fields', 'error');
        if (newPassword !== confirmPassword) return showToast('Passwords do not match', 'error');

        try {
            await apiResetPassword({ email, newPassword });
            showToast('Password updated successfully!', 'success');
            closeModal('forgotModalOverlay');
        } catch (err) {
            showToast(err.message, 'error');
        }
    });
}

export function checkAdminUI() {
    const userStr = localStorage.getItem(KEY_USER);
    if (!userStr) return;
    
    const user = JSON.parse(userStr);
    const adminLink = document.getElementById('adminLink');
    const greeting = document.getElementById('userGreeting');

    if (greeting) greeting.textContent = `Hello, ${user.username}`;
    if (adminLink && user.is_admin) {
        adminLink.style.display = 'flex';
    }
}
