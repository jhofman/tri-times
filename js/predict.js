// Race Predictor

let raceChoices, yearChoices;
let currentData = null;
let selectedAthlete = null;

// Athlete search state
const shardCache = {};
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

function medianOf(arr) {
    if (arr.length === 0) return 50;
    const s = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

function updateSearchHighlight() {
    const items = document.querySelectorAll('#search-results .search-item[data-name]');
    items.forEach((el, i) => {
        el.classList.toggle('search-item-active', i === highlightIndex);
        if (i === highlightIndex) el.scrollIntoView({ block: 'nearest' });
    });
}

async function searchAthletes(query) {
    const container = document.getElementById('search-results');
    if (!query || query.length < 2) {
        container.innerHTML = '';
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

    if (lastMatches.length === 0) {
        container.innerHTML = '<div class="search-item search-empty">No athletes found</div>';
        return;
    }

    container.innerHTML = lastMatches.map((name, i) => {
        const races = shard[name];
        const raceCount = races.length;
        return `<div class="search-item${i === highlightIndex ? ' search-item-active' : ''}" data-name="${name.replace(/"/g, '&quot;')}">
            <div class="search-item-name">${name}</div>
            <div class="search-item-detail">${raceCount} race${raceCount !== 1 ? 's' : ''}</div>
        </div>`;
    }).join('');

    container.querySelectorAll('.search-item[data-name]').forEach(el => {
        el.addEventListener('click', () => selectAthlete(el.dataset.name));
    });
}

function selectAthlete(name) {
    const letter = name[0].toLowerCase();
    const shard = shardCache[letter];
    if (!shard || !shard[name]) return;

    document.getElementById('search-results').innerHTML = '';
    document.getElementById('athlete-search').value = name;
    document.getElementById('clear-athlete').style.display = 'inline-block';
    lastMatches = [];
    highlightIndex = -1;

    // [race, year, swim, t1, bike, t2, run, finish, div, swim%, t1%, bike%, t2%, run%, finish%]
    const entries = shard[name];
    selectedAthlete = { name, raceCount: entries.length };

    const medians = {
        swim: medianOf(entries.map(e => e[9])),
        t1: medianOf(entries.map(e => e[10])),
        bike: medianOf(entries.map(e => e[11])),
        t2: medianOf(entries.map(e => e[12])),
        run: medianOf(entries.map(e => e[13])),
    };

    for (const [split, val] of Object.entries(medians)) {
        document.getElementById(`pctl-${split}`).value = val;
    }

    updateDescription();
    if (currentData) updateProjection();
    updateUrl();
}

function clearAthlete() {
    document.getElementById('athlete-search').value = '';
    document.getElementById('search-results').innerHTML = '';
    document.getElementById('clear-athlete').style.display = 'none';
    lastMatches = [];
    highlightIndex = -1;
    selectedAthlete = null;
    updateDescription();
    updateUrl();
}

function updateDescription() {
    const desc = document.getElementById('predict-description');
    if (selectedAthlete) {
        const n = selectedAthlete.raceCount;
        desc.innerHTML = `Using <strong>${selectedAthlete.name}</strong>'s historical percentiles from ${n} race${n !== 1 ? 's' : ''} to predict their time. You can adjust the percentiles below.`;
        desc.style.display = 'block';
    } else {
        desc.style.display = 'none';
    }
}

function interpolateTime(sorted, pct) {
    if (sorted.length === 0) return 0;
    const pos = (pct / 100) * sorted.length;
    const lower = Math.floor(pos);
    const upper = Math.min(lower + 1, sorted.length - 1);
    const frac = pos - lower;
    return Math.round(sorted[Math.min(lower, sorted.length - 1)] * (1 - frac) + sorted[upper] * frac);
}

function findPercentile(sorted, time) {
    if (sorted.length === 0) return 50;
    let count = 0;
    for (let i = 0; i < sorted.length; i++) {
        if (sorted[i] <= time) count++;
        else break;
    }
    return Math.round((count / sorted.length) * 100);
}

function updateYears(raceId) {
    const years = RACES[raceId].years;
    yearChoices.clearStore();
    yearChoices.setChoices(years.map(y => ({ value: y, label: y })), 'value', 'label', true);
    yearChoices.setChoiceByValue(years[0]);
}

async function updateProjection() {
    const raceId = document.getElementById('race-select').value;
    const year = document.getElementById('year-select').value;

    if (!raceId || !year) {
        document.getElementById('projection').style.display = 'none';
        return;
    }

    currentData = await loadRaceData(raceId, year);
    if (!currentData || currentData.length === 0) {
        document.getElementById('projection').style.display = 'none';
        return;
    }

    const splits = ['swim', 't1', 'bike', 't2', 'run'];
    const splitLabels = { swim: 'Swim', t1: 'T1', bike: 'Bike', t2: 'T2', run: 'Run' };

    const sortedArrays = {};
    for (const split of [...splits, 'finish']) {
        sortedArrays[split] = currentData.map(d => d[split]).filter(v => v > 0).sort((a, b) => a - b);
    }

    let totalSeconds = 0;
    const rows = [];

    for (const split of splits) {
        const pct = Math.max(1, Math.min(99, parseInt(document.getElementById(`pctl-${split}`).value) || 50));
        const time = interpolateTime(sortedArrays[split], pct);
        totalSeconds += time;
        rows.push({ label: splitLabels[split], pct, time });
    }

    const tbody = document.getElementById('projection-body');
    tbody.innerHTML = rows.map(r => `
        <tr>
            <td>${r.label}</td>
            <td>${r.pct}%</td>
            <td>${formatTime(r.time)}</td>
        </tr>
    `).join('');

    const finishPctl = findPercentile(sortedArrays.finish, totalSeconds);
    document.getElementById('finish-pctl').textContent = `~${finishPctl}%`;
    document.getElementById('finish-time').textContent = formatTime(totalSeconds);
    document.getElementById('projection').style.display = 'block';

    updateUrl();
}

function updateUrl() {
    const params = new URLSearchParams();
    if (selectedAthlete) params.set('athlete', selectedAthlete.name);

    const raceId = document.getElementById('race-select').value;
    const year = document.getElementById('year-select').value;
    if (raceId) params.set('race', raceId);
    if (year) params.set('year', year);

    for (const split of ['swim', 't1', 'bike', 't2', 'run']) {
        const val = document.getElementById(`pctl-${split}`).value;
        if (val && val !== '50') params.set(split, val);
    }

    history.replaceState(null, '', '?' + params.toString());
}

async function init() {
    RACES = await loadRaces();

    const raceEntries = Object.entries(RACES).sort((a, b) => a[1].name.localeCompare(b[1].name));
    raceChoices = new Choices('#race-select', {
        searchEnabled: true,
        searchPlaceholderValue: 'Search races...',
        itemSelectText: '',
        shouldSort: false,
        placeholderValue: 'Select a race...',
        choices: raceEntries.map(([id, race]) => ({ value: id, label: race.name }))
    });

    yearChoices = new Choices('#year-select', {
        searchEnabled: false,
        itemSelectText: '',
        shouldSort: false
    });

    // Athlete search
    const searchInput = document.getElementById('athlete-search');
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
            updateSearchHighlight();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            highlightIndex = Math.max(highlightIndex - 1, 0);
            updateSearchHighlight();
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

    document.getElementById('clear-athlete').addEventListener('click', clearAthlete);

    // Parse URL params
    const params = new URLSearchParams(window.location.search);

    for (const split of ['swim', 't1', 'bike', 't2', 'run']) {
        const val = params.get(split);
        if (val) document.getElementById(`pctl-${split}`).value = val;
    }

    const raceParam = params.get('race') || 'western-massachusetts';
    const yearParam = params.get('year') || '2024';
    if (RACES[raceParam]) {
        raceChoices.setChoiceByValue(raceParam);
        updateYears(raceParam);
        if (RACES[raceParam].years.includes(yearParam)) {
            yearChoices.setChoiceByValue(yearParam);
        }
    }

    // Restore athlete from URL
    const athleteParam = params.get('athlete');
    if (athleteParam) {
        searchInput.value = athleteParam;
        await fetchShard(athleteParam[0].toLowerCase());
        selectAthlete(athleteParam);
    }

    if (RACES[raceParam]) {
        await updateProjection();
    }

    // Bind events
    document.getElementById('race-select').addEventListener('change', async function () {
        const raceId = this.value;
        if (raceId && RACES[raceId]) {
            updateYears(raceId);
            await updateProjection();
        }
    });

    document.getElementById('year-select').addEventListener('change', async function () {
        await updateProjection();
    });

    for (const split of ['swim', 't1', 'bike', 't2', 'run']) {
        document.getElementById(`pctl-${split}`).addEventListener('input', async function () {
            if (currentData) await updateProjection();
        });
    }
}

init();
