window.ICONS = {
    sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41"></path></svg>',
    moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"></path></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"></path></svg>',
    external: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3h7v7M21 3l-9 9"></path><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path></svg>',
    github: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.88c-2.78.6-3.37-1.18-3.37-1.18-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.35 1.09 2.92.83.09-.65.35-1.09.64-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02A9.6 9.6 0 0 1 12 6.82a9.6 9.6 0 0 1 2.5.34c1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.86v2.76c0 .27.18.58.69.48A10 10 0 0 0 12 2z"></path></svg>',
    chevronUp: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 15 6-6 6 6"></path></svg>',
    chevronDown: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"></path></svg>',
};

(function () {
    const page = document.body.dataset.page;
    const items = [
        ['race', 'index.html', 'Single Race'],
        ['compare', 'compare.html', 'Compare'],
        ['races', 'races.html', 'All Races'],
        ['athlete', 'athlete.html', 'Athletes'],
        ['predict', 'predict.html', 'Predict'],
    ];
    const header = document.createElement('header');
    header.className = 'topbar';
    header.innerHTML = `
        <a class="brand" href="index.html"><span class="brand-dot"></span>Tri Times</a>
        <nav class="tabs" aria-label="Primary">
            ${items.map(([id, href, label]) =>
                `<a href="${href}" data-page="${id}"${id === page ? ' aria-current="page"' : ''}>${label}</a>`
            ).join('')}
        </nav>
        <span class="topbar-spacer"></span>
        <button id="theme-toggle" class="icon-btn" type="button" aria-label="Switch theme"></button>
        <a class="icon-btn" href="https://github.com/jhofman/tri-times" aria-label="Source on GitHub">${ICONS.github}</a>
    `;
    document.body.prepend(header);
})();
