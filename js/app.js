// Ironman 70.3 Results Visualization - Single Race View

const CHARTS = {
    swim: { id: 'swim-chart', color: 'var(--swim)' },
    t1: { id: 't1-chart', color: 'var(--t1)' },
    bike: { id: 'bike-chart', color: 'var(--bike)' },
    t2: { id: 't2-chart', color: 'var(--t2)' },
    run: { id: 'run-chart', color: 'var(--run)' },
    finish: { id: 'finish-chart', color: 'var(--finish)' },
};

let currentRaceData = []; // Data for current race/year
let currentRace = null;
let currentYear = null;
let currentData = [];
let selectedAthlete = null;
let raceChoices = null;
let yearChoices = null;
let divisionChoices = null;
let athleteChoices = null;

// Update division dropdown based on current race data
function updateDivisions() {
    const divisions = getDivisions(currentRaceData);

    const allOptions = [
        { value: 'ALL', label: 'Everyone' },
        { value: 'ALL_M', label: 'All Men' },
        { value: 'ALL_F', label: 'All Women' },
        ...divisions.map(d => ({ value: d, label: d }))
    ];

    divisionChoices.clearStore();
    divisionChoices.setChoices(allOptions, 'value', 'label', true);
    divisionChoices.setChoiceByValue('ALL');
}

// Update year dropdown based on selected race
function updateYears(race) {
    const years = RACES[race].years;
    const yearOptions = years.map(y => ({ value: y, label: y }));

    yearChoices.clearStore();
    yearChoices.setChoices(yearOptions, 'value', 'label', true);
    yearChoices.setChoiceByValue(years[0]);
}

// Filter data by division
function filterData(division) {
    if (division === 'ALL') {
        currentData = currentRaceData;
    } else if (division === 'ALL_M') {
        currentData = currentRaceData.filter(d => d.division.startsWith('M'));
    } else if (division === 'ALL_F') {
        currentData = currentRaceData.filter(d => d.division.startsWith('F'));
    } else {
        currentData = currentRaceData.filter(d => d.division === division);
    }

    const suffix = division && division !== 'ALL'
        ? ` · ${document.getElementById('division-select').selectedOptions[0]?.textContent || division}`
        : '';
    d3.select('#stats').text(`${currentData.length.toLocaleString()} athletes${suffix}`);
}

function updateUrl() {
    const params = new URLSearchParams();
    params.set('race', currentRace);
    params.set('year', currentYear);
    const division = document.getElementById('division-select').value;
    if (division && division !== 'ALL') params.set('division', division);
    if (selectedAthlete) params.set('athlete', selectedAthlete['Athlete Name']);
    history.replaceState(null, '', '?' + params.toString());
}

// Load data for a race/year and update display
async function loadAndDisplayRace(race, year) {
    d3.select('#stats').text('Loading...');
    currentRace = race;
    currentYear = year;
    currentRaceData = await loadRaceData(race, year);
    updateDivisions();
    clearAthlete(false);
    filterData('ALL');
    drawCharts();
    setPageTitle(`${RACES[race].name} · ${year}`, `${RACES[race].name} ${year}`);
    updateUrl();
}

function renderChart(field) {
    const config = CHARTS[field];
    const card = document.getElementById(config.id);
    const values = currentData.map(d => d[field]).filter(v => v > 0);
    if (values.length === 0) {
        d3.select(card).select('svg').remove();
        d3.select(card).select('.no-data').remove();
        d3.select(card).append('div')
            .attr('class', 'no-data')
            .text('No data for this division');
        card.querySelector('.chart-stats').innerHTML = '';
        card.querySelector('.chart-sub').innerHTML = '';
        return;
    }

    const athlete = selectedAthlete && selectedAthlete[field] > 0
        ? {
            name: selectedAthlete['Athlete Name'],
            value: selectedAthlete[field],
            division: selectedAthlete.division,
        }
        : null;
    const result = renderHistogram(card, {
        field,
        series: [{ id: 'race', values, color: config.color, label: RACES[currentRace].name }],
        style: 'outline',
        yMode: 'count',
        markers: { quartiles: true, band: true, athlete },
        tooltip: document.getElementById('tooltip'),
    });
    const stats = result.series[0];
    card.querySelector('.chart-stats').innerHTML = stats.q.map((value, index) => {
        const pct = [25, 50, 75][index];
        const pace = formatPace(field, value);
        return `<span><b>${pct}%</b> ${formatChartTime(field, value)}${pace ? ` <i class="pace">${pace}</i>` : ''}</span>`;
    }).join('');

    const outside = stats.belowDomain + stats.aboveDomain;
    const chip = athlete
        ? `<span class="chip" style="--chip:${config.color}">${escapeHtml(athlete.name)} · ${formatChartTime(field, athlete.value)}${formatPace(field, athlete.value) ? ` · ${formatPace(field, athlete.value)}` : ''} · ${stats.athletePct}% percentile in ${escapeHtml(athlete.division)}</span>`
        : '';
    const outsideNote = outside
        ? `<span class="outside-note">${outside.toLocaleString()} result${outside === 1 ? '' : 's'} outside view</span>`
        : '';
    card.querySelector('.chart-sub').innerHTML = `${chip}${outsideNote}`;
}

function drawCharts() {
    Object.keys(CHARTS).forEach(renderChart);
}

function searchAthletes(query) {
    if (!query || query.length < 1) return [];

    const q = query.toLowerCase();
    return currentRaceData
        .map((a, i) => ({ athlete: a, index: i }))
        .filter(({ athlete }) => athlete['Athlete Name'].toLowerCase().includes(q))
        .slice(0, 20)
        .map(({ athlete, index }) => ({
            value: String(index),
            label: athlete['Athlete Name'],
            customProperties: {
                name: athlete['Athlete Name'],
                location: `${athlete['City']}, ${athlete['State']} - ${athlete.division}`
            }
        }));
}

function selectAthleteByIndex(index) {
    if (index === '' || index === null) {
        selectedAthlete = null;
        drawCharts();
        updateUrl();
        return;
    }

    const athlete = currentRaceData[parseInt(index)];
    if (athlete) {
        selectedAthlete = athlete;
        divisionChoices.setChoiceByValue(athlete.division);
        filterData(athlete.division);
        drawCharts();
        updateUrl();
    }
}

function clearAthlete(redraw = true) {
    selectedAthlete = null;
    athleteChoices.removeActiveItems();
    if (redraw) {
        drawCharts();
        updateUrl();
    }
}

async function init() {
    d3.select('#stats').text('Loading...');

    await loadRaces();

    // Initialize Choices.js on race dropdown
    raceChoices = new Choices('#race-select', {
        searchEnabled: true,
        searchPlaceholderValue: 'Search races...',
        itemSelectText: '',
        shouldSort: false,
        choices: Object.entries(RACES).map(([id, race]) => ({
            value: id,
            label: race.name
        }))
    });

    // Initialize Choices.js on year dropdown
    yearChoices = new Choices('#year-select', {
        searchEnabled: false,
        itemSelectText: '',
        shouldSort: false
    });

    // Initialize Choices.js on division dropdown
    divisionChoices = new Choices('#division-select', {
        searchEnabled: true,
        searchPlaceholderValue: 'Search divisions...',
        itemSelectText: '',
        shouldSort: false
    });

    document.getElementById('race-select').addEventListener('change', async function() {
        const race = this.value;
        updateYears(race);
        const year = document.getElementById('year-select').value;
        await loadAndDisplayRace(race, year);
    });

    document.getElementById('year-select').addEventListener('change', async function() {
        const race = document.getElementById('race-select').value;
        const year = this.value;
        await loadAndDisplayRace(race, year);
    });

    document.getElementById('division-select').addEventListener('change', function() {
        filterData(this.value);
        drawCharts();
        updateUrl();
    });

    // Initialize Choices.js on athlete dropdown
    athleteChoices = new Choices('#athlete-select', {
        searchEnabled: true,
        searchPlaceholderValue: 'Type to search athletes...',
        placeholderValue: 'Type to search...',
        itemSelectText: '',
        shouldSort: false,
        allowHTML: true,
        removeItemButton: true,
        searchFloor: 1,
        searchResultLimit: 20,
        noResultsText: 'Type to search athletes...',
        noChoicesText: 'Type to search athletes...',
        callbackOnCreateTemplates: function(template) {
            return {
                choice: (classNames, data) => {
                    return template(`
                        <div class="${classNames.item} ${classNames.itemChoice} ${data.disabled ? classNames.itemDisabled : classNames.itemSelectable} athlete-choice"
                             data-select-text="${this.config.itemSelectText}"
                             data-choice
                             data-id="${data.id}"
                             data-value="${data.value}"
                             ${data.disabled ? 'data-choice-disabled aria-disabled="true"' : 'data-choice-selectable'}
                             role="option">
                            ${data.customProperties ? `
                                <div class="athlete-choice-name">${data.customProperties.name}</div>
                                <div class="athlete-choice-details">${data.customProperties.location}</div>
                            ` : data.label}
                        </div>
                    `);
                }
            };
        }
    });

    // Handle search input to dynamically load athlete choices
    athleteChoices.passedElement.element.addEventListener('search', function(event) {
        const results = searchAthletes(event.detail.value);
        athleteChoices.clearChoices();
        athleteChoices.setChoices(results, 'value', 'label', true);
    });

    document.getElementById('athlete-select').addEventListener('change', function() {
        selectAthleteByIndex(this.value);
    });

    // Check for query params, otherwise default to New York
    const params = new URLSearchParams(window.location.search);
    const initialRace = params.get('race') || 'new-york';
    raceChoices.setChoiceByValue(initialRace);
    updateYears(initialRace);
    const yearParam = params.get('year');
    if (yearParam) yearChoices.setChoiceByValue(yearParam);
    const initialYear = document.getElementById('year-select').value;

    // Load initial race data
    await loadAndDisplayRace(initialRace, initialYear);

    // Restore division and athlete from params
    const divisionParam = params.get('division');
    if (divisionParam) {
        divisionChoices.setChoiceByValue(divisionParam);
        filterData(divisionParam);
        drawCharts();
    }
    const athleteParam = params.get('athlete');
    if (athleteParam) {
        const q = athleteParam.toLowerCase();
        const idx = currentRaceData.findIndex(a => a['Athlete Name'].toLowerCase() === q);
        if (idx >= 0) {
            const results = searchAthletes(athleteParam);
            athleteChoices.setChoices(results, 'value', 'label', true);
            athleteChoices.setChoiceByValue(String(idx));
            selectAthleteByIndex(idx);
        }
    }

    observeHistogramCards(drawCharts);
}

init();
