export function showToast(msg, type = 'info') {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.className = `toast ${type} show`;
    setTimeout(() => { t.className = 'toast'; }, 3000);
}

export function delay(ms) { 
    return new Promise(r => setTimeout(r, ms)); 
}

export function openModal(id) { 
    const m = document.getElementById(id); 
    if(m) m.classList.add('open');    
}

export function closeModal(id) { 
    const m = document.getElementById(id); 
    if(m) m.classList.remove('open'); 
}

export function showView(name) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(name + 'View')?.classList.add('active');
}
