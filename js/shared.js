// Shared utilities for Ironman 70.3 Results Explorer

const RESULTS_PATH = 'results/';
let RACES = null;

// Format seconds to H:MM:SS
function formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Format seconds to shorter format for axis (H:MM)
function formatTimeShort(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}:${String(m).padStart(2, '0')}`;
}

function formatTransitionTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
}

function formatChartTime(field, seconds) {
    return field === 't1' || field === 't2'
        ? formatTransitionTime(seconds)
        : formatTimeShort(seconds);
}

function formatDelta(seconds) {
    const rounded = Math.round(seconds);
    if (rounded < 3600) return formatTransitionTime(rounded);
    return formatTime(rounded);
}

const DISTANCES = {
    swim: { m: 1900 },
    bike: { mi: 56 },
    run: { mi: 13.1 },
};

function formatPace(field, seconds) {
    if (!seconds || seconds <= 0) return null;
    if (field === 'swim') {
        return `${formatTransitionTime(seconds / (DISTANCES.swim.m / 100))}/100m`;
    }
    if (field === 'bike') {
        return `${(DISTANCES.bike.mi / (seconds / 3600)).toFixed(1)} mph`;
    }
    if (field === 'run') {
        return `${formatTransitionTime(seconds / DISTANCES.run.mi)}/mi`;
    }
    return null;
}

function nearestRank(sorted, percentile) {
    if (sorted.length === 0) return 0;
    return sorted[Math.min(Math.floor(sorted.length * percentile), sorted.length - 1)];
}

function ordinal(value) {
    const n = Math.round(value);
    const mod100 = n % 100;
    if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
    if (n % 10 === 1) return `${n}st`;
    if (n % 10 === 2) return `${n}nd`;
    if (n % 10 === 3) return `${n}rd`;
    return `${n}th`;
}

function timeTicks(domain, targetCount = 5) {
    const steps = [30, 60, 120, 300, 600, 900, 1200, 1800, 3600];
    const rawStep = (domain[1] - domain[0]) / Math.max(targetCount, 1);
    const step = steps.reduce((best, candidate) =>
        Math.abs(candidate - rawStep) < Math.abs(best - rawStep) ? candidate : best
    );
    const start = Math.ceil(domain[0] / step) * step;
    return d3.range(start, domain[1] + step * 0.5, step);
}

function setPageTitle(heading, documentHeading = heading) {
    const pageTitle = document.getElementById('page-title');
    if (pageTitle) pageTitle.textContent = heading;
    document.title = `${documentHeading} · Tri Times`;
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Load races manifest
async function loadRaces() {
    if (RACES) return RACES;
    const response = await fetch(`${RESULTS_PATH}races.json`);
    RACES = await response.json();
    return RACES;
}

// Cache for loaded race data
const raceDataCache = {};

// Load CSV data for a single race/year (lazy loading with cache)
async function loadRaceData(raceId, year) {
    const cacheKey = `${raceId}_${year}`;

    // Return cached data if available
    if (raceDataCache[cacheKey]) {
        return raceDataCache[cacheKey];
    }

    // Load and cache the data
    const data = await d3.csv(`${RESULTS_PATH}${raceId}_${year}.csv`);
    const processed = data.map(d => ({
        ...d,
        swim: +d['Swim (Seconds)'],
        t1: +d['T1 (Seconds)'],
        bike: +d['Bike (Seconds)'],
        t2: +d['T2 (Seconds)'],
        run: +d['Run (Seconds)'],
        finish: +d['Finish (Seconds)'],
        division: d['Division'].replace(/"/g, '')
    })).filter(d => d.finish > 0); // Filter out DNFs

    raceDataCache[cacheKey] = processed;
    return processed;
}

// Helper to get cached data synchronously (returns undefined if not loaded)
function getCachedRaceData(raceId, year) {
    return raceDataCache[`${raceId}_${year}`];
}

// Get unique divisions from data, sorted
function getDivisions(data) {
    const divs = [...new Set(data.map(d => d.division))];
    return divs.sort((a, b) => {
        const genderA = a[0], genderB = b[0];
        if (genderA !== genderB) return genderA === 'M' ? -1 : 1;
        const ageA = parseInt(a.slice(1));
        const ageB = parseInt(b.slice(1));
        return ageA - ageB;
    });
}

// Debounce helper
function debounce(fn, delay) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn.apply(this, args), delay);
    };
}
