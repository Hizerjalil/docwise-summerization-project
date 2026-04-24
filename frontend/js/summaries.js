import { apiGetSummaries, apiSaveSummary, apiDeleteSummary, apiSummarize, apiGetSummaryById } from './api.js';
import { showToast, showView, openModal, closeModal, delay } from './ui.js';
import { KEY_TOKEN, KEY_USER } from './config.js';

let summaries = [];
let activeSummaryId = null;
let pendingDeleteId = null;
let currentSummaryText = '';
let selectedFile = null;
let activeTab = 'upload';
let currentDetailLevel = 'concise';

export async function initWork() {
    if (!document.getElementById('uploadView')) return;

    const pasteArea = document.getElementById('pasteTextArea');
    const userGreeting = document.getElementById('userGreeting');

    // Load Greeting & Auth Guard
    const user = JSON.parse(localStorage.getItem(KEY_USER) || 'null');
    if (!localStorage.getItem(KEY_TOKEN)) {
        window.location.href = 'sign.html';
        return;
    }
    if (user && userGreeting) userGreeting.textContent = `Hello, ${user.username}`;
    
    // Show admin link if user is admin
    const adminLink = document.getElementById('adminLink');
    if (user && user.is_admin && adminLink) {
        adminLink.style.display = 'inline-flex';
    }

    // Initialization
    loadSummaries();

    // Event Listeners
    setupWorkEvents(pasteArea);
}

function setupWorkEvents(pasteArea) {
    // Tabs
    window.switchTab = function(tab) {
        activeTab = tab;
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        document.getElementById('tab' + tab.charAt(0).toUpperCase() + tab.slice(1))?.classList.add('active');
        document.getElementById('panel' + tab.charAt(0).toUpperCase() + tab.slice(1))?.classList.add('active');
    };

    // Paste Area Actions
    pasteArea?.addEventListener('input', function () {
        const cc = document.getElementById('charCount');
        if (cc) cc.textContent = this.value.length.toLocaleString() + ' characters';
    });

    window.clearPasteText = () => {
        if (!pasteArea) return;
        pasteArea.value = '';
        const cc = document.getElementById('charCount');
        if (cc) cc.textContent = '0 characters';
        showToast('Text cleared.', 'info');
    };

    // File Input
    document.getElementById('fileInput')?.addEventListener('change', e => {
        if (e.target.files[0]) {
            selectedFile = e.target.files[0];
            document.getElementById('fileNameDisplay').textContent = '📄 ' + selectedFile.name;
        }
    });

    // New Chat
    document.getElementById('newChatBtn')?.addEventListener('click', () => {
        activeSummaryId = null;
        selectedFile = null;
        currentSummaryText = '';
        document.getElementById('fileNameDisplay').textContent = '';
        document.getElementById('outputPlaceholder').style.display = '';
        document.getElementById('summaryText').style.display = 'none';
        document.getElementById('actionRow').style.display = 'none';
        if (pasteArea) pasteArea.value = '';
        showView('upload');
        renderSidebar();
    });

    // Summarize
    document.getElementById('summarizeBtn')?.addEventListener('click', handleSummarize);

    // Sidebar Search
    document.getElementById('searchInput')?.addEventListener('input', (e) => renderSidebar(e.target.value));

    // Copy & Download
    document.getElementById('copyBtn')?.addEventListener('click', () => copyToClipboard(currentSummaryText));
    document.getElementById('copySummaryBtn')?.addEventListener('click', () => copyToClipboard(currentSummaryText));
    document.getElementById('downloadBtn')?.addEventListener('click', () => downloadText(currentSummaryText, 'summary.txt'));
    document.getElementById('downloadSummaryBtn')?.addEventListener('click', () => downloadText(currentSummaryText, 'summary.txt'));

    // Delete Flow
    document.getElementById('deleteSummaryBtn')?.addEventListener('click', () => {
        pendingDeleteId = activeSummaryId;
        openModal('deleteModalOverlay');
    });

    document.getElementById('confirmDelete')?.addEventListener('click', async () => {
        if (!pendingDeleteId) return;
        try {
            await apiDeleteSummary(pendingDeleteId);
            summaries = summaries.filter(s => (s._id || s.id) !== pendingDeleteId);
            activeSummaryId = null;
            renderSidebar();
            showView('upload');
            showToast('Deleted!', 'info');
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            closeModal('deleteModalOverlay');
        }
    });

    document.getElementById('cancelDelete')?.addEventListener('click', () => closeModal('deleteModalOverlay'));

    // Detail Level Selector
    document.querySelectorAll('.option-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.option-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            currentDetailLevel = this.getAttribute('data-level');
        });
    });

    // Logout
    document.getElementById('logoutBtn')?.addEventListener('click', () => openModal('logoutModalOverlay'));
    document.getElementById('confirmLogout')?.addEventListener('click', () => {
        localStorage.clear();
        window.location.href = 'sign.html';
    });
    document.getElementById('cancelLogout')?.addEventListener('click', () => closeModal('logoutModalOverlay'));
}

async function loadSummaries() {
    try {
        summaries = await apiGetSummaries();
        renderSidebar();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function renderSidebar(filter = '') {
    const sidebarList = document.getElementById('sidebarList');
    if (!sidebarList) return;
    sidebarList.innerHTML = '';
    const filtered = summaries.filter(s => s.title.toLowerCase().includes(filter.toLowerCase()));

    if (filtered.length === 0) {
        sidebarList.innerHTML = '<p style="color:rgba(255,255,255,.4);font-size:.8rem;padding:10px 14px;">No summaries</p>';
        return;
    }

    filtered.forEach(s => {
        const sid = s._id || s.id;
        const item = document.createElement('div');
        item.className = 'sidebar-item' + (activeSummaryId === sid ? ' active' : '');
        item.textContent = s.title;
        item.addEventListener('click', () => viewSavedSummary(s));
        sidebarList.appendChild(item);
    });
}

async function viewSavedSummary(s) {
    const sid = s._id || s.id;
    activeSummaryId = sid;
    
    document.getElementById('summaryViewTitle').textContent = s.title;
    document.getElementById('savedSummaryText').textContent = 'Loading...';
    showView('summary');
    renderSidebar(document.getElementById('searchInput')?.value || '');

    try {
        const fullSummary = await apiGetSummaryById(sid);
        document.getElementById('savedSummaryText').textContent = fullSummary.text;
        currentSummaryText = fullSummary.text;
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function handleSummarize() {
    let inputText = '';
    let title = '';

    if (activeTab === 'upload') {
        if (!selectedFile) return showToast('Upload file first!', 'error');
        inputText = await readFileText(selectedFile);
        title = selectedFile.name.replace(/\.[^/.]+$/, '');
    } else {
        const pasteArea = document.getElementById('pasteTextArea');
        inputText = pasteArea?.value.trim() || '';
        if (!inputText) return showToast('Paste text first!', 'error');
        title = 'Text Summary';
    }

    document.getElementById('loadingOverlay')?.classList.add('open');

    try {
        let result;
        if (activeTab === 'upload') {
            const formData = new FormData();
            formData.append('file', selectedFile);
            formData.append('detailLevel', currentDetailLevel);
            result = await apiSummarize(formData);
            inputText = result.original_text;
            title = selectedFile.name.replace(/\.[^/.]+$/, '');
        } else {
            const pasteArea = document.getElementById('pasteTextArea');
            inputText = pasteArea?.value.trim() || '';
            if (!inputText) return showToast('Paste text first!', 'error');
            result = await apiSummarize({ text: inputText, detailLevel: currentDetailLevel });
            title = 'Text Summary';
        }

        const summary = result.summary;
        currentSummaryText = summary;

        // Note: apiSummarize already saves to the DB, so we just add the result to our list
        summaries.unshift({
            _id: result.id, 
            title: title,
            text: summary,
            mode: result.mode,
            created_at: new Date().toISOString()
        });
        
        document.getElementById('outputPlaceholder').style.display = 'none';
        const st = document.getElementById('summaryText');
        st.textContent = summary;
        st.style.display = '';
        document.getElementById('actionRow').style.display = 'flex';
        renderSidebar();
        showToast('Summary generated successfully!', 'success');
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        document.getElementById('loadingOverlay')?.classList.remove('open');
    }
}

function readFileText(file) {
    return new Promise(r => {
        const reader = new FileReader();
        reader.onload = e => r(e.target.result);
        reader.readAsText(file);
    });
}

function copyToClipboard(text) {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => showToast('Copied!', 'success'));
}

function downloadText(text, filename) {
    if (!text) return;
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
}
