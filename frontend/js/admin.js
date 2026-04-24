const API_BASE = 'http://127.0.0.1:5001/api';
const token = localStorage.getItem('docwise_token');

if (!token) {
    window.location.href = 'sign.html';
}

let currentSection = 'users';

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadData();
});

window.showSection = function(section) {
    currentSection = section;
    const title = document.getElementById('section-title');
    if (title) title.innerText = section === 'users' ? 'User Management' : 'Summary Logs';
    
    document.getElementById('nav-users')?.classList.toggle('active', section === 'users');
    document.getElementById('nav-summaries')?.classList.toggle('active', section === 'summaries');
    
    loadData();
}

async function loadData() {
    showLoading(true);
    try {
        if (currentSection === 'users') {
            await fetchUsers();
        } else {
            await fetchSummaries();
        }
    } catch (err) {
        console.error(err);
        if (err.status === 401 || err.status === 403) {
            alert('Access Denied: Admin privileges required.');
            window.location.href = 'work.html';
        } else {
            alert('Failed to load data. Please check your connection.');
        }
    } finally {
        showLoading(false);
    }
}

async function fetchUsers() {
    const res = await fetch(`${API_BASE}/admin/users`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw res;
    const users = await res.json();
    
    const countEl = document.getElementById('count-users');
    if (countEl) countEl.innerText = users.length;
    renderUsers(users);
}

async function fetchSummaries() {
    const res = await fetch(`${API_BASE}/admin/summaries`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw res;
    const summaries = await res.json();
    
    const countEl = document.getElementById('count-summaries');
    if (countEl) countEl.innerText = summaries.length;
    renderSummaries(summaries);
}

function renderUsers(users) {
    let html = `
        <table>
            <thead>
                <tr>
                    <th>Username</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Joined</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    users.forEach(user => {
        html += `
            <tr>
                <td>${user.username}</td>
                <td>${user.email}</td>
                <td><span class="badge ${user.is_admin ? 'badge-admin' : 'badge-user'}">${user.is_admin ? 'Admin' : 'User'}</span></td>
                <td>${new Date(user.created_at).toLocaleDateString()}</td>
                <td>
                    <button class="btn btn-danger btn-sm" onclick="deleteUser('${user._id}')">Delete</button>
                    ${!user.is_admin ? `<button class="btn btn-sm" style="background-color: #2563eb; color: white; margin-left: 5px;" onclick="makeAdmin('${user._id}')">Promote</button>` : ''}
                </td>
            </tr>
        `;
    });
    
    html += '</tbody></table>';
    document.getElementById('content-area').innerHTML = html;
}

function renderSummaries(summaries) {
    let html = `
        <table>
            <thead>
                <tr>
                    <th>Title</th>
                    <th>Mode</th>
                    <th>Date</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    summaries.forEach(s => {
        html += `
            <tr>
                <td>${s.title}</td>
                <td>${s.mode}</td>
                <td>${new Date(s.created_at).toLocaleDateString()}</td>
                <td>
                    <button class="btn btn-danger btn-sm" onclick="deleteSummary('${s._id}')">Delete</button>
                </td>
            </tr>
        `;
    });
    
    html += '</tbody></table>';
    document.getElementById('content-area').innerHTML = html;
}

window.deleteUser = async function(id) {
    if (!confirm('Are you sure you want to delete this user?')) return;
    try {
        const res = await fetch(`${API_BASE}/admin/users/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Delete failed');
        loadData();
    } catch (err) {
        alert(err.message);
    }
}

window.makeAdmin = async function(id) {
    if (!confirm('Promote this user to admin?')) return;
    try {
        const res = await fetch(`${API_BASE}/admin/users/${id}`, {
            method: 'PUT',
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ is_admin: true })
        });
        if (!res.ok) throw new Error('Promotion failed');
        loadData();
    } catch (err) {
        alert(err.message);
    }
}

window.deleteSummary = async function(id) {
    if (!confirm('Are you sure you want to delete this summary?')) return;
    try {
        const res = await fetch(`${API_BASE}/admin/summaries/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Delete failed');
        loadData();
    } catch (err) {
        alert(err.message);
    }
}

function showLoading(show) {
    const loader = document.getElementById('loading');
    const content = document.getElementById('content-area');
    if (loader) loader.style.display = show ? 'flex' : 'none';
    if (content) content.style.display = show ? 'none' : 'block';
}

window.logout = function() {
    localStorage.removeItem('docwise_token');
    localStorage.removeItem('docwise_user');
    window.location.href = 'sign.html';
}
