(function () {
    const html = document.documentElement;

    function renderIcon() {
        const toggle = document.getElementById('theme-toggle');
        if (!toggle) return;
        const isDark = html.dataset.theme === 'dark';
        toggle.innerHTML = isDark ? ICONS.sun : ICONS.moon;
        toggle.setAttribute('aria-label', isDark ? 'Switch to light theme' : 'Switch to dark theme');
    }

    renderIcon();
    document.getElementById('theme-toggle')?.addEventListener('click', () => {
        html.dataset.theme = html.dataset.theme === 'dark' ? 'light' : 'dark';
        localStorage.setItem('theme', html.dataset.theme);
        renderIcon();
    });
})();
