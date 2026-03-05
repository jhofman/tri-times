// Theme toggle functionality
(function() {
    const html = document.documentElement;

    // Default to light theme
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        // Only go dark if explicitly saved
    } else {
        html.classList.add('light-theme');
    }

    // Setup toggle button after DOM loads
    document.addEventListener('DOMContentLoaded', () => {
        const toggle = document.getElementById('theme-toggle');
        if (!toggle) return;

        // Set initial icon (sun = light mode active, moon = dark mode active)
        const isLight = html.classList.contains('light-theme');
        toggle.innerHTML = isLight ? '<i class="fas fa-moon"></i>' : '<i class="fas fa-sun"></i>';

        toggle.addEventListener('click', () => {
            html.classList.toggle('light-theme');
            const isLight = html.classList.contains('light-theme');
            toggle.innerHTML = isLight ? '<i class="fas fa-moon"></i>' : '<i class="fas fa-sun"></i>';
            localStorage.setItem('theme', isLight ? 'light' : 'dark');
        });
    });
})();
