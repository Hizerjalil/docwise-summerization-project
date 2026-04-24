export function initLanding() {
    if (!document.querySelector('.faq')) return;

    window.toggleFaq = function(btn) {
        const item = btn.parentElement;
        const answer = item.querySelector('.faq-answer');
        const isOpen = btn.classList.contains('open');

        document.querySelectorAll('.faq-question').forEach(q => {
            q.classList.remove('open');
            const ans = q.parentElement.querySelector('.faq-answer');
            if (ans) ans.style.maxHeight = null;
        });

        if (!isOpen) {
            btn.classList.add('open');
            if (answer) answer.style.maxHeight = answer.scrollHeight + 'px';
        }
    };

    window.addEventListener('scroll', () => {
        const nav = document.querySelector('.navbar');
        if (!nav) return;
        if (window.scrollY > 10) {
            nav.style.boxShadow = '0 4px 20px rgba(0,0,0,0.12)';
        } else {
            nav.style.boxShadow = '0 2px 10px rgba(0,0,0,0.06)';
        }
    });
}
