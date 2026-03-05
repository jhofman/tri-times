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

// Load races manifest
async function loadRaces() {
    if (RACES) return RACES;
    const response = await fetch(`${RESULTS_PATH}races.json`);
    RACES = await response.json();
    return RACES;
}

// Load all CSV data for all races
async function loadAllData() {
    const races = await loadRaces();
    const allData = {};
    const promises = [];

    for (const [raceId, race] of Object.entries(races)) {
        allData[raceId] = {};
        for (const year of race.years) {
            promises.push(
                d3.csv(`${RESULTS_PATH}${raceId}_${year}.csv`).then(data => {
                    allData[raceId][year] = data.map(d => ({
                        ...d,
                        swim: +d['Swim (Seconds)'],
                        t1: +d['T1 (Seconds)'],
                        bike: +d['Bike (Seconds)'],
                        t2: +d['T2 (Seconds)'],
                        run: +d['Run (Seconds)'],
                        finish: +d['Finish (Seconds)'],
                        division: d['Division'].replace(/"/g, '')
                    })).filter(d => d.finish > 0); // Filter out DNFs
                })
            );
        }
    }
    await Promise.all(promises);
    return allData;
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
