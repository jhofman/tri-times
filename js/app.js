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

let allData = {};
let currentRace = null;
let currentData = [];
let selectedAthlete = null;

// Update division dropdown based on selected race/year
function updateDivisions(race, year) {
    const select = d3.select('#division-select');
    const divisions = getDivisions(allData[race][year]);

    const allOptions = [
        { value: 'ALL', label: 'Everyone' },
        { value: 'ALL_M', label: 'All Men' },
        { value: 'ALL_F', label: 'All Women' },
        ...divisions.map(d => ({ value: d, label: d }))
    ];

    select.selectAll('option').remove();
    select.selectAll('option')
        .data(allOptions)
        .enter()
        .append('option')
        .attr('value', d => d.value)
        .text(d => d.label);
}

// Update year dropdown based on selected race
function updateYears(race) {
    const select = d3.select('#year-select');
    const years = RACES[race].years;

    select.selectAll('option').remove();
    select.selectAll('option')
        .data(years)
        .enter()
        .append('option')
        .attr('value', d => d)
        .text(d => d);
}

// Filter data by race, year, and division
function filterData(race, year, division) {
    const data = allData[race][year];

    if (division === 'ALL') {
        currentData = data;
    } else if (division === 'ALL_M') {
        currentData = data.filter(d => d.division.startsWith('M'));
    } else if (division === 'ALL_F') {
        currentData = data.filter(d => d.division.startsWith('F'));
    } else {
        currentData = data.filter(d => d.division === division);
    }

    d3.select('#stats').text(`${currentData.length} athletes`);
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

    // Draw quartile lines
    quartiles.forEach(q => {
        const qx = x(q.value);
        if (qx >= 0 && qx <= innerWidth) {
            g.append('line')
                .attr('class', 'quartile-line')
                .attr('x1', qx)
                .attr('x2', qx)
                .attr('y1', 0)
                .attr('y2', innerHeight);

            g.append('text')
                .attr('class', 'quartile-label')
                .attr('x', qx)
                .attr('y', 0)
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

function getAthletes(race, year) {
    return allData[race]?.[year] || [];
}

function searchAthletes(query, race, year) {
    if (!query || query.length < 2) return [];
    const q = query.toLowerCase();
    return getAthletes(race, year)
        .filter(a => a['Athlete Name'].toLowerCase().includes(q))
        .slice(0, 10);
}

function setupAthleteSearch() {
    const input = d3.select('#athlete-input');
    const dropdown = d3.select('#athlete-dropdown');

    input.on('input', function() {
        const query = this.value;
        const race = d3.select('#race-select').property('value');
        const year = d3.select('#year-select').property('value');
        const results = searchAthletes(query, race, year);

        if (results.length === 0) {
            dropdown.classed('visible', false);
            return;
        }

        dropdown.classed('visible', true);
        dropdown.selectAll('.athlete-option').remove();

        dropdown.selectAll('.athlete-option')
            .data(results)
            .enter()
            .append('div')
            .attr('class', 'athlete-option')
            .html(d => `
                <div class="name">${d['Athlete Name']}</div>
                <div class="location">${d['City']}, ${d['State']} - ${d['Division'].replace(/"/g, '')}</div>
            `)
            .on('click', function(event, d) {
                selectAthlete(d);
                input.property('value', d['Athlete Name']);
                dropdown.classed('visible', false);
            });
    });

    input.on('blur', function() {
        setTimeout(() => dropdown.classed('visible', false), 200);
    });

    input.on('focus', function() {
        if (this.value.length >= 2) {
            const race = d3.select('#race-select').property('value');
            const year = d3.select('#year-select').property('value');
            const results = searchAthletes(this.value, race, year);
            if (results.length > 0) {
                dropdown.classed('visible', true);
            }
        }
    });
}

function selectAthlete(athlete) {
    selectedAthlete = athlete;
    const race = d3.select('#race-select').property('value');
    const year = d3.select('#year-select').property('value');

    d3.select('#division-select').property('value', athlete.division);
    filterData(race, year, athlete.division);
    drawCharts();
}

function clearAthlete() {
    selectedAthlete = null;
    d3.select('#athlete-input').property('value', '');
    drawCharts();
}

function handleResize() {
    drawCharts();
}

async function init() {
    d3.select('#stats').text('Loading data...');

    await loadRaces();
    allData = await loadAllData();

    // Populate race dropdown
    const raceSelect = d3.select('#race-select');
    raceSelect.selectAll('option')
        .data(Object.entries(RACES))
        .enter()
        .append('option')
        .attr('value', d => d[0])
        .text(d => d[1].name);

    raceSelect.on('change', function() {
        const race = this.value;
        currentRace = race;
        updateYears(race);
        const year = d3.select('#year-select').property('value');
        updateDivisions(race, year);
        clearAthlete();
        const division = d3.select('#division-select').property('value');
        filterData(race, year, division);
        drawCharts();
    });

    d3.select('#year-select').on('change', function() {
        const race = d3.select('#race-select').property('value');
        const year = this.value;
        updateDivisions(race, year);
        clearAthlete();
        const division = d3.select('#division-select').property('value');
        filterData(race, year, division);
        drawCharts();
    });

    d3.select('#division-select').on('change', function() {
        const race = d3.select('#race-select').property('value');
        const year = d3.select('#year-select').property('value');
        filterData(race, year, this.value);
        drawCharts();
    });

    setupAthleteSearch();

    // Initialize with Jones Beach 2025
    const initialRace = 'jonesbeach';
    d3.select('#race-select').property('value', initialRace);
    currentRace = initialRace;
    updateYears(initialRace);
    const initialYear = '2025';
    updateDivisions(initialRace, initialYear);

    d3.select('#division-select').property('value', 'ALL');
    filterData(initialRace, initialYear, 'ALL');
    drawCharts();

    window.addEventListener('resize', debounce(handleResize, 150));
}

init();
