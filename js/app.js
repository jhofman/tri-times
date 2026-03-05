// Ironman 70.3 Results Visualization - Single Race View

// ColorBrewer Set1 colors per chart
const CHART_COLORS = {
    swim:   { fill: 'rgba(55, 126, 184, 0.6)', hover: 'rgba(55, 126, 184, 0.9)' },
    t1:     { fill: 'rgba(166, 206, 227, 0.6)', hover: 'rgba(166, 206, 227, 0.9)' },
    bike:   { fill: 'rgba(77, 175, 74, 0.6)', hover: 'rgba(77, 175, 74, 0.9)' },
    t2:     { fill: 'rgba(178, 223, 138, 0.6)', hover: 'rgba(178, 223, 138, 0.9)' },
    run:    { fill: 'rgba(228, 26, 28, 0.6)', hover: 'rgba(228, 26, 28, 0.9)' },
    finish: { fill: 'rgba(152, 78, 163, 0.6)', hover: 'rgba(152, 78, 163, 0.9)' }
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

    d3.select('#stats').text(`${currentData.length} athletes`);
}

// Load data for a race/year and update display
async function loadAndDisplayRace(race, year) {
    d3.select('#stats').text('Loading...');
    currentRace = race;
    currentYear = year;
    currentRaceData = await loadRaceData(race, year);
    updateDivisions();
    clearAthlete();
    filterData('ALL');
    drawCharts();
}

// Draw a histogram
function drawHistogram(containerId, field, title) {
    const container = d3.select(`#${containerId}`);
    container.select('svg').remove();
    container.select('.no-data').remove();

    const values = currentData.map(d => d[field]).filter(v => v > 0);
    if (values.length === 0) {
        container.append('div')
            .attr('class', 'no-data')
            .text('No data');
        return;
    }

    const sorted = [...values].sort((a, b) => a - b);
    const quartiles = [
        { pct: 25, value: sorted[Math.floor(sorted.length * 0.25)] },
        { pct: 50, value: sorted[Math.floor(sorted.length * 0.5)] },
        { pct: 75, value: sorted[Math.floor(sorted.length * 0.75)] }
    ];

    const margin = { top: 20, right: 20, bottom: 35, left: 45 };
    const width = container.node().clientWidth - 32;
    const height = 200;
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const svg = container.append('svg')
        .attr('width', width)
        .attr('height', height);

    const g = svg.append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    const xExtent = d3.extent(values);
    const x = d3.scaleLinear()
        .domain([xExtent[0] * 0.95, xExtent[1] * 1.05])
        .range([0, innerWidth]);

    const histogram = d3.bin()
        .domain(x.domain())
        .thresholds(40);

    const bins = histogram(values);
    const sortedValues = [...values].sort((a, b) => a - b);

    const y = d3.scaleLinear()
        .domain([0, d3.max(bins, d => d.length)])
        .nice()
        .range([innerHeight, 0]);

    const tooltip = d3.select('#tooltip');
    const colors = CHART_COLORS[field];

    g.selectAll('.bar')
        .data(bins)
        .enter()
        .append('rect')
        .attr('class', 'bar')
        .attr('x', d => x(d.x0) + 1)
        .attr('y', d => y(d.length))
        .attr('width', d => Math.max(0, x(d.x1) - x(d.x0) - 2))
        .attr('height', d => innerHeight - y(d.length))
        .attr('fill', colors.fill)
        .on('mouseenter', function(event, d) {
            d3.select(this).attr('fill', colors.hover);
            const countBelow = sortedValues.filter(v => v < d.x0).length;
            const countAtOrBelow = sortedValues.filter(v => v <= d.x1).length;
            const pctLow = Math.round((countBelow / values.length) * 100);
            const pctHigh = Math.round((countAtOrBelow / values.length) * 100);

            const pctText = pctLow === pctHigh
                ? `${pctHigh}th percentile`
                : `${pctLow}th - ${pctHigh}th percentile`;

            tooltip
                .classed('visible', true)
                .html(`
                    <div class="time-range">${formatTime(d.x0)} - ${formatTime(d.x1)}</div>
                    <div class="count">${d.length} athlete${d.length !== 1 ? 's' : ''}</div>
                    <div class="percentile">${pctText}</div>
                `);
        })
        .on('mousemove', function(event) {
            tooltip
                .style('left', (event.clientX + 12) + 'px')
                .style('top', (event.clientY - 10) + 'px');
        })
        .on('mouseleave', function() {
            d3.select(this).attr('fill', colors.fill);
            tooltip.classed('visible', false);
        });

    g.append('g')
        .attr('class', 'axis')
        .attr('transform', `translate(0,${innerHeight})`)
        .call(d3.axisBottom(x).ticks(5).tickFormat(formatTimeShort));

    g.append('g')
        .attr('class', 'axis')
        .call(d3.axisLeft(y).ticks(5));

    // Draw quartile lines (stagger y positions to avoid overlap)
    const labelYPositions = [-2, -12, -2];
    const lineYPositions = [0, -10, 0];
    quartiles.forEach((q, i) => {
        const qx = x(q.value);
        if (qx >= 0 && qx <= innerWidth) {
            g.append('line')
                .attr('class', 'quartile-line')
                .attr('x1', qx)
                .attr('x2', qx)
                .attr('y1', lineYPositions[i])
                .attr('y2', innerHeight);

            g.append('text')
                .attr('class', 'quartile-label')
                .attr('x', qx)
                .attr('y', labelYPositions[i])
                .attr('text-anchor', 'middle')
                .text(formatTimeShort(q.value));
        }
    });

    // Draw athlete marker if selected
    if (selectedAthlete && selectedAthlete[field] > 0) {
        const athleteTime = selectedAthlete[field];
        const athleteX = x(athleteTime);

        if (athleteX >= 0 && athleteX <= innerWidth) {
            g.append('line')
                .attr('class', 'athlete-marker')
                .attr('x1', athleteX)
                .attr('x2', athleteX)
                .attr('y1', 0)
                .attr('y2', innerHeight);

            const pct = Math.round((sortedValues.filter(v => v <= athleteTime).length / values.length) * 100);

            g.append('text')
                .attr('class', 'athlete-label')
                .attr('x', athleteX)
                .attr('y', -12)
                .attr('text-anchor', 'middle')
                .text(`${formatTimeShort(athleteTime)} (${pct}%)`);
        }
    }
}

function drawCharts() {
    drawHistogram('swim-chart', 'swim', 'Swim');
    drawHistogram('t1-chart', 't1', 'T1');
    drawHistogram('bike-chart', 'bike', 'Bike');
    drawHistogram('t2-chart', 't2', 'T2');
    drawHistogram('run-chart', 'run', 'Run');
    drawHistogram('finish-chart', 'finish', 'Overall');
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
        return;
    }

    const athlete = currentRaceData[parseInt(index)];
    if (athlete) {
        selectedAthlete = athlete;
        divisionChoices.setChoiceByValue(athlete.division);
        filterData(athlete.division);
        drawCharts();
    }
}

function clearAthlete() {
    selectedAthlete = null;
    athleteChoices.removeActiveItems();
    drawCharts();
}

function handleResize() {
    drawCharts();
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

    // Initialize with New York
    const initialRace = 'new-york';
    raceChoices.setChoiceByValue(initialRace);
    updateYears(initialRace);
    const initialYear = document.getElementById('year-select').value;

    // Load initial race data
    await loadAndDisplayRace(initialRace, initialYear);

    window.addEventListener('resize', debounce(handleResize, 150));
}

init();
