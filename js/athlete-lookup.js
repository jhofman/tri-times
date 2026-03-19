// Athlete Lookup

const shardCache = {};
let currentResults = [];
let sortColumn = 'year';
let sortAsc = false;
let lastMatches = [];
let highlightIndex = -1;

async function fetchShard(letter) {
    if (shardCache[letter]) return shardCache[letter];
    try {
        const response = await fetch(`results/athletes/${letter}.json`);
        if (!response.ok) return {};
        const data = await response.json();
        shardCache[letter] = data;
        return data;
    } catch {
        return {};
    }
}

function updateHighlight() {
    const items = document.querySelectorAll('#search-results .search-item[data-name]');
    items.forEach((el, i) => {
        el.classList.toggle('search-item-active', i === highlightIndex);
        if (i === highlightIndex) el.scrollIntoView({ block: 'nearest' });
    });
}

async function searchAthletes(query) {
    if (!query || query.length < 2) {
        document.getElementById('search-results').innerHTML = '';
        lastMatches = [];
        highlightIndex = -1;
        return;
    }

    const letter = query[0].toLowerCase();
    const shard = await fetchShard(letter);
    const q = query.toLowerCase();

    lastMatches = Object.keys(shard)
        .filter(name => name.toLowerCase().includes(q))
        .sort((a, b) => {
            const aStarts = a.toLowerCase().startsWith(q) ? 0 : 1;
            const bStarts = b.toLowerCase().startsWith(q) ? 0 : 1;
            if (aStarts !== bStarts) return aStarts - bStarts;
            return a.localeCompare(b);
        })
        .slice(0, 50);

    highlightIndex = lastMatches.length === 1 ? 0 : -1;

    const container = document.getElementById('search-results');
    if (lastMatches.length === 0) {
        container.innerHTML = '<div class="search-item search-empty">No athletes found</div>';
        return;
    }

    container.innerHTML = lastMatches.map((name, i) => {
        const races = shard[name];
        const raceCount = races.length;
        const raceNames = [...new Set(races.map(r => r[0]))].slice(0, 3)
            .map(id => id.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' '));
        const summary = raceNames.join(', ') + (raceCount > 3 ? `, +${raceCount - raceNames.length} more` : '');
        return `<div class="search-item${i === highlightIndex ? ' search-item-active' : ''}" data-name="${name.replace(/"/g, '&quot;')}">
            <div class="search-item-name">${name}</div>
            <div class="search-item-detail">${raceCount} race${raceCount !== 1 ? 's' : ''}: ${summary}</div>
        </div>`;
    }).join('');

    container.querySelectorAll('.search-item[data-name]').forEach(el => {
        el.addEventListener('click', () => selectAthlete(el.dataset.name));
    });
}

function clearSearch() {
    document.getElementById('athlete-search').value = '';
    document.getElementById('search-results').innerHTML = '';
    document.getElementById('athlete-results').style.display = 'none';
    document.getElementById('stats').textContent = '';
    document.getElementById('clear-search').style.display = 'none';
    lastMatches = [];
    highlightIndex = -1;
    currentResults = [];
    history.replaceState(null, '', window.location.pathname);
}

function selectAthlete(name) {
    const letter = name[0].toLowerCase();
    const shard = shardCache[letter];
    if (!shard || !shard[name]) return;

    document.getElementById('search-results').innerHTML = '';
    document.getElementById('athlete-search').value = name;
    document.getElementById('athlete-name').textContent = name;
    document.getElementById('athlete-results').style.display = 'block';
    document.getElementById('clear-search').style.display = 'inline-block';
    lastMatches = [];
    highlightIndex = -1;

    // races: [race_id, year, swim, bike, run, finish, division, swim_pct, bike_pct, run_pct, finish_pct]
    currentResults = shard[name].map(r => ({
        raceId: r[0],
        race: r[0].split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' '),
        year: r[1],
        swim: r[2],
        bike: r[3],
        run: r[4],
        finish: r[5],
        division: r[6],
        swimPct: r[7],
        bikePct: r[8],
        runPct: r[9],
        finishPct: r[10],
    }));

    sortColumn = 'year';
    sortAsc = false;
    renderResults();
    updateUrl(name);
}

function renderResults() {
    const tbody = document.getElementById('results-table-body');

    const sorted = [...currentResults].sort((a, b) => {
        let va = a[sortColumn];
        let vb = b[sortColumn];
        if (typeof va === 'string') {
            va = va.toLowerCase();
            vb = vb.toLowerCase();
        }
        if (va < vb) return sortAsc ? -1 : 1;
        if (va > vb) return sortAsc ? 1 : -1;
        return 0;
    });

    const name = document.getElementById('athlete-search').value;

    tbody.innerHTML = sorted.map(r => `
        <tr>
            <td><a href="index.html?race=${r.raceId}&year=${r.year}&athlete=${encodeURIComponent(name)}">${r.race}</a></td>
            <td>${r.year}</td>
            <td>${r.division}</td>
            <td>${formatTime(r.swim)} <span class="pct">(${r.swimPct}%)</span></td>
            <td>${formatTime(r.bike)} <span class="pct">(${r.bikePct}%)</span></td>
            <td>${formatTime(r.run)} <span class="pct">(${r.runPct}%)</span></td>
            <td>${formatTime(r.finish)} <span class="pct">(${r.finishPct}%)</span></td>
        </tr>
    `).join('');

    // Median percentile summary row
    const tfoot = document.getElementById('results-table-foot');
    if (currentResults.length > 0) {
        const median = arr => {
            const s = [...arr].sort((a, b) => a - b);
            const mid = Math.floor(s.length / 2);
            return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
        };
        const medSwim = median(currentResults.map(r => r.swimPct));
        const medBike = median(currentResults.map(r => r.bikePct));
        const medRun = median(currentResults.map(r => r.runPct));
        const medFinish = median(currentResults.map(r => r.finishPct));
        tfoot.innerHTML = `
            <tr class="summary-row">
                <td colspan="3"><strong>Median Percentile</strong></td>
                <td><strong>${medSwim}%</strong></td>
                <td><strong>${medBike}%</strong></td>
                <td><strong>${medRun}%</strong></td>
                <td><strong>${medFinish}%</strong></td>
            </tr>`;
    } else {
        tfoot.innerHTML = '';
    }

    document.getElementById('stats').textContent = `${currentResults.length} race${currentResults.length !== 1 ? 's' : ''}`;

    document.querySelectorAll('#results-table th').forEach(th => {
        const arrow = th.querySelector('.sort-arrow');
        if (th.dataset.sort === sortColumn) {
            arrow.textContent = sortAsc ? ' ▲' : ' ▼';
        } else {
            arrow.textContent = '';
        }
    });
}

function updateUrl(name) {
    const params = new URLSearchParams();
    if (name) params.set('athlete', name);
    history.replaceState(null, '', '?' + params.toString());
}

async function init() {
    const searchInput = document.getElementById('athlete-search');
    const clearBtn = document.getElementById('clear-search');
    let debounceTimer;

    searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        const val = searchInput.value.trim();
        if (val.length < 2) {
            document.getElementById('search-results').innerHTML = '';
            lastMatches = [];
            highlightIndex = -1;
            return;
        }
        debounceTimer = setTimeout(() => searchAthletes(val), 200);
    });

    searchInput.addEventListener('keydown', (e) => {
        if (lastMatches.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            highlightIndex = Math.min(highlightIndex + 1, lastMatches.length - 1);
            updateHighlight();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            highlightIndex = Math.max(highlightIndex - 1, 0);
            updateHighlight();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (highlightIndex >= 0 && highlightIndex < lastMatches.length) {
                selectAthlete(lastMatches[highlightIndex]);
            } else if (lastMatches.length === 1) {
                selectAthlete(lastMatches[0]);
            }
        } else if (e.key === 'Escape') {
            document.getElementById('search-results').innerHTML = '';
            lastMatches = [];
            highlightIndex = -1;
        }
    });

    clearBtn.addEventListener('click', clearSearch);

    document.querySelectorAll('#results-table th[data-sort]').forEach(th => {
        th.addEventListener('click', () => {
            const col = th.dataset.sort;
            if (sortColumn === col) {
                sortAsc = !sortAsc;
            } else {
                sortColumn = col;
                sortAsc = true;
            }
            renderResults();
        });
    });

    // Restore from URL params
    const params = new URLSearchParams(window.location.search);
    const athleteParam = params.get('athlete');
    if (athleteParam) {
        searchInput.value = athleteParam;
        const letter = athleteParam[0].toLowerCase();
        await fetchShard(letter);
        selectAthlete(athleteParam);
    }
}

init();
