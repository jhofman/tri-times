// Ironman 70.3 Race Comparison

// Colors for comparison
const COMPARE_COLORS = {
    raceA: { fill: 'rgba(55, 126, 184, 0.5)', stroke: 'rgb(55, 126, 184)' },    // blue
    raceB: { fill: 'rgba(255, 127, 0, 0.5)', stroke: 'rgb(255, 127, 0)' }       // orange
};

let allData = {}; // allData[race][year] = [...]
let dataA = [];
let dataB = [];

// Get unique divisions from both datasets, sorted
function getCombinedDivisions() {
    const divsA = dataA.map(d => d.division);
    const divsB = dataB.map(d => d.division);
    const divs = [...new Set([...divsA, ...divsB])];
    return divs.sort((a, b) => {
        const genderA = a[0], genderB = b[0];
        if (genderA !== genderB) return genderA === 'M' ? -1 : 1;
        const ageA = parseInt(a.slice(1));
        const ageB = parseInt(b.slice(1));
        return ageA - ageB;
    });
}

// Update year dropdown based on selected race
function updateYears(raceSelectId, yearSelectId) {
    const race = d3.select(`#${raceSelectId}`).property('value');
    const select = d3.select(`#${yearSelectId}`);
    const years = RACES[race].years;

    select.selectAll('option').remove();
    select.selectAll('option')
        .data(years)
        .enter()
        .append('option')
        .attr('value', d => d)
        .text(d => d);
}

// Update division dropdown
function updateDivisions() {
    const select = d3.select('#division-select');
    const divisions = getCombinedDivisions();

    const currentValue = select.property('value');

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

    // Restore previous value if still valid
    if (allOptions.some(o => o.value === currentValue)) {
        select.property('value', currentValue);
    }
}

// Load data for both races
function loadRaceData() {
    const raceA = d3.select('#race-a-select').property('value');
    const yearA = d3.select('#year-a-select').property('value');
    const raceB = d3.select('#race-b-select').property('value');
    const yearB = d3.select('#year-b-select').property('value');

    dataA = allData[raceA]?.[yearA] || [];
    dataB = allData[raceB]?.[yearB] || [];

    updateDivisions();
}

// Filter data by division
function filterByDivision(data, division) {
    if (division === 'ALL') return data;
    if (division === 'ALL_M') return data.filter(d => d.division.startsWith('M'));
    if (division === 'ALL_F') return data.filter(d => d.division.startsWith('F'));
    return data.filter(d => d.division === division);
}

// Update stats display
function updateStats() {
    const division = d3.select('#division-select').property('value');
    const filteredA = filterByDivision(dataA, division);
    const filteredB = filterByDivision(dataB, division);

    const raceAName = RACES[d3.select('#race-a-select').property('value')].name;
    const raceBName = RACES[d3.select('#race-b-select').property('value')].name;
}

// Calculate comparison text for a field
function getComparisonText(field) {
    const division = d3.select('#division-select').property('value');
    const filteredA = filterByDivision(dataA, division);
    const filteredB = filterByDivision(dataB, division);

    const raceAName = RACES[d3.select('#race-a-select').property('value')].name;
    const raceBName = RACES[d3.select('#race-b-select').property('value')].name;

    const valuesA = filteredA.map(d => d[field]).filter(v => v > 0);
    const valuesB = filteredB.map(d => d[field]).filter(v => v > 0);

    if (valuesA.length === 0 || valuesB.length === 0) return '';

    const medianA = [...valuesA].sort((a, b) => a - b)[Math.floor(valuesA.length * 0.5)];
    const medianB = [...valuesB].sort((a, b) => a - b)[Math.floor(valuesB.length * 0.5)];
    const diff = Math.abs(medianA - medianB);

    if (diff < 30) return '';
    if (medianA < medianB) {
        return `<span style="color: ${COMPARE_COLORS.raceA.stroke}">${raceAName} typically ${formatTime(diff)} faster</span>`;
    } else {
        return `<span style="color: ${COMPARE_COLORS.raceB.stroke}">${raceBName} typically ${formatTime(diff)} faster</span>`;
    }
}

// Draw comparison histogram
function drawComparisonHistogram(containerId, field) {
    const container = d3.select(`#${containerId}`);
    container.select('svg').remove();
    container.select('.no-data').remove();

    const division = d3.select('#division-select').property('value');
    const valuesA = filterByDivision(dataA, division).map(d => d[field]).filter(v => v > 0);
    const valuesB = filterByDivision(dataB, division).map(d => d[field]).filter(v => v > 0);

    if (valuesA.length === 0 && valuesB.length === 0) {
        container.append('div')
            .attr('class', 'no-data')
            .text('No data');
        return;
    }

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

    // Combined extent for shared scale
    const allValues = [...valuesA, ...valuesB];
    const xExtent = d3.extent(allValues);
    const x = d3.scaleLinear()
        .domain([xExtent[0] * 0.95, xExtent[1] * 1.05])
        .range([0, innerWidth]);

    // Create histogram bins
    const histogram = d3.bin()
        .domain(x.domain())
        .thresholds(30);

    const binsA = histogram(valuesA);
    const binsB = histogram(valuesB);

    const maxCount = Math.max(
        d3.max(binsA, d => d.length) || 0,
        d3.max(binsB, d => d.length) || 0
    );

    const y = d3.scaleLinear()
        .domain([0, maxCount])
        .nice()
        .range([innerHeight, 0]);

    const tooltip = d3.select('#tooltip');

    // Draw Race A bars
    if (valuesA.length > 0) {
        g.selectAll('.bar-a')
            .data(binsA)
            .enter()
            .append('rect')
            .attr('class', 'bar bar-a')
            .attr('x', d => x(d.x0) + 1)
            .attr('y', d => y(d.length))
            .attr('width', d => Math.max(0, x(d.x1) - x(d.x0) - 2))
            .attr('height', d => innerHeight - y(d.length))
            .attr('fill', COMPARE_COLORS.raceA.fill);
    }

    // Draw Race B bars
    if (valuesB.length > 0) {
        g.selectAll('.bar-b')
            .data(binsB)
            .enter()
            .append('rect')
            .attr('class', 'bar bar-b')
            .attr('x', d => x(d.x0) + 1)
            .attr('y', d => y(d.length))
            .attr('width', d => Math.max(0, x(d.x1) - x(d.x0) - 2))
            .attr('height', d => innerHeight - y(d.length))
            .attr('fill', COMPARE_COLORS.raceB.fill);
    }

    // X axis
    g.append('g')
        .attr('class', 'axis')
        .attr('transform', `translate(0,${innerHeight})`)
        .call(d3.axisBottom(x).ticks(5).tickFormat(formatTimeShort));

    // Y axis
    g.append('g')
        .attr('class', 'axis')
        .call(d3.axisLeft(y).ticks(5));

    // Draw median lines
    if (valuesA.length > 0) {
        const sortedA = [...valuesA].sort((a, b) => a - b);
        const medianA = sortedA[Math.floor(sortedA.length * 0.5)];
        const medianAX = x(medianA);

        g.append('line')
            .attr('class', 'median-line')
            .attr('x1', medianAX)
            .attr('x2', medianAX)
            .attr('y1', 0)
            .attr('y2', innerHeight)
            .attr('stroke', COMPARE_COLORS.raceA.stroke)
            .attr('stroke-width', 2)
            .attr('stroke-dasharray', '4,2');

        g.append('text')
            .attr('class', 'median-label')
            .attr('x', medianAX)
            .attr('y', -2)
            .attr('text-anchor', 'middle')
            .attr('fill', COMPARE_COLORS.raceA.stroke)
            .text(formatTimeShort(medianA));
    }

    if (valuesB.length > 0) {
        const sortedB = [...valuesB].sort((a, b) => a - b);
        const medianB = sortedB[Math.floor(sortedB.length * 0.5)];
        const medianBX = x(medianB);

        g.append('line')
            .attr('class', 'median-line')
            .attr('x1', medianBX)
            .attr('x2', medianBX)
            .attr('y1', 0)
            .attr('y2', innerHeight)
            .attr('stroke', COMPARE_COLORS.raceB.stroke)
            .attr('stroke-width', 2)
            .attr('stroke-dasharray', '4,2');

        g.append('text')
            .attr('class', 'median-label')
            .attr('x', medianBX)
            .attr('y', -12)
            .attr('text-anchor', 'middle')
            .attr('fill', COMPARE_COLORS.raceB.stroke)
            .text(formatTimeShort(medianB));
    }
}

// Update chart title with comparison
function updateChartTitle(containerId, title, field) {
    const container = d3.select(`#${containerId}`);
    const comparison = getComparisonText(field);
    const h3 = container.select('h3');

    if (comparison) {
        h3.html(`${title} <span class="chart-comparison">${comparison}</span>`);
    } else {
        h3.text(title);
    }
}

// Draw all charts
function drawCharts() {
    updateStats();
    drawComparisonHistogram('swim-chart', 'swim');
    drawComparisonHistogram('t1-chart', 't1');
    drawComparisonHistogram('bike-chart', 'bike');
    drawComparisonHistogram('t2-chart', 't2');
    drawComparisonHistogram('run-chart', 'run');
    drawComparisonHistogram('finish-chart', 'finish');

    // Update titles with comparisons
    updateChartTitle('swim-chart', 'Swim', 'swim');
    updateChartTitle('t1-chart', 'T1', 't1');
    updateChartTitle('bike-chart', 'Bike', 'bike');
    updateChartTitle('t2-chart', 'T2', 't2');
    updateChartTitle('run-chart', 'Run', 'run');
    updateChartTitle('finish-chart', 'Overall', 'finish');
}

// Handle window resize
function handleResize() {
    drawCharts();
}

// Initialize
async function init() {
    await loadRaces();
    allData = await loadAllData();

    // Populate race dropdowns
    const raceOptions = Object.entries(RACES);

    d3.select('#race-a-select').selectAll('option')
        .data(raceOptions)
        .enter()
        .append('option')
        .attr('value', d => d[0])
        .text(d => d[1].name);

    d3.select('#race-b-select').selectAll('option')
        .data(raceOptions)
        .enter()
        .append('option')
        .attr('value', d => d[0])
        .text(d => d[1].name);

    // Set default: first two different races
    d3.select('#race-a-select').property('value', 'northcarolina');
    d3.select('#race-b-select').property('value', 'jonesbeach');

    // Initialize year dropdowns
    updateYears('race-a-select', 'year-a-select');
    updateYears('race-b-select', 'year-b-select');

    // Event listeners
    d3.select('#race-a-select').on('change', function() {
        updateYears('race-a-select', 'year-a-select');
        loadRaceData();
        drawCharts();
    });

    d3.select('#year-a-select').on('change', function() {
        loadRaceData();
        drawCharts();
    });

    d3.select('#race-b-select').on('change', function() {
        updateYears('race-b-select', 'year-b-select');
        loadRaceData();
        drawCharts();
    });

    d3.select('#year-b-select').on('change', function() {
        loadRaceData();
        drawCharts();
    });

    d3.select('#division-select').on('change', function() {
        drawCharts();
    });

    // Load initial data
    loadRaceData();

    // Default to Everyone
    d3.select('#division-select').property('value', 'ALL');

    drawCharts();

    window.addEventListener('resize', debounce(handleResize, 150));
}

init();
