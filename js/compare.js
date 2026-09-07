const COMPARE_CHARTS = {
    swim: { id: 'swim-chart', color: 'var(--swim)' },
    t1: { id: 't1-chart', color: 'var(--t1)' },
    bike: { id: 'bike-chart', color: 'var(--bike)' },
    t2: { id: 't2-chart', color: 'var(--t2)' },
    run: { id: 'run-chart', color: 'var(--run)' },
    finish: { id: 'finish-chart', color: 'var(--finish)' },
};

let dataA = [];
let dataB = [];
let raceAChoices = null;
let raceBChoices = null;
let yearAChoices = null;
let yearBChoices = null;
let divisionChoices = null;

function getCombinedDivisions() {
    return [...new Set([...dataA, ...dataB].map(d => d.division))].sort((a, b) => {
        const genderA = a[0], genderB = b[0];
        if (genderA !== genderB) return genderA === 'M' ? -1 : 1;
        return parseInt(a.slice(1)) - parseInt(b.slice(1));
    });
}

function updateYears(raceSelectId, yearSelectId) {
    const race = document.getElementById(raceSelectId).value;
    const years = RACES[race].years;
    const choices = yearSelectId === 'year-a-select' ? yearAChoices : yearBChoices;
    choices.clearStore();
    choices.setChoices(years.map(year => ({ value: year, label: year })), 'value', 'label', true);
    choices.setChoiceByValue(years[0]);
}

function updateDivisions() {
    const current = document.getElementById('division-select').value;
    const options = [
        { value: 'ALL', label: 'Everyone' },
        { value: 'ALL_M', label: 'All Men' },
        { value: 'ALL_F', label: 'All Women' },
        ...getCombinedDivisions().map(value => ({ value, label: value })),
    ];
    divisionChoices.clearStore();
    divisionChoices.setChoices(options, 'value', 'label', true);
    divisionChoices.setChoiceByValue(options.some(option => option.value === current) ? current : 'ALL');
}

function filterByDivision(data, division) {
    if (division === 'ALL') return data;
    if (division === 'ALL_M') return data.filter(d => d.division.startsWith('M'));
    if (division === 'ALL_F') return data.filter(d => d.division.startsWith('F'));
    return data.filter(d => d.division === division);
}

function comparisonState() {
    const raceA = document.getElementById('race-a-select').value;
    const raceB = document.getElementById('race-b-select').value;
    const yearA = document.getElementById('year-a-select').value;
    const yearB = document.getElementById('year-b-select').value;
    const division = document.getElementById('division-select').value || 'ALL';
    return {
        raceA,
        raceB,
        yearA,
        yearB,
        division,
        labelA: `${RACES[raceA].name} ${yearA}`,
        labelB: `${RACES[raceB].name} ${yearB}`,
        filteredA: filterByDivision(dataA, division),
        filteredB: filterByDivision(dataB, division),
    };
}

function updateUrl(state) {
    const params = new URLSearchParams({
        race_a: state.raceA,
        year_a: state.yearA,
        race_b: state.raceB,
        year_b: state.yearB,
    });
    if (state.division !== 'ALL') params.set('division', state.division);
    history.replaceState(null, '', `?${params}`);
}

function updateLegend(state) {
    const divisionText = state.division === 'ALL' ? '' : ` in ${state.division}`;
    document.getElementById('compare-legend').innerHTML = `
        <span class="legend-item"><span class="race-dot" style="--dot:var(--race-a)"></span>${escapeHtml(state.labelA)} · ${state.filteredA.length.toLocaleString()} athletes${divisionText}</span>
        <span class="legend-item"><span class="race-dot" style="--dot:var(--race-b)"></span>${escapeHtml(state.labelB)} · ${state.filteredB.length.toLocaleString()} athletes${divisionText}</span>
    `;
    setPageTitle(`${state.labelA} vs ${state.labelB}`);
}

async function loadComparisonData() {
    const raceA = document.getElementById('race-a-select').value;
    const raceB = document.getElementById('race-b-select').value;
    const yearA = document.getElementById('year-a-select').value;
    const yearB = document.getElementById('year-b-select').value;
    [dataA, dataB] = await Promise.all([
        loadRaceData(raceA, yearA),
        loadRaceData(raceB, yearB),
    ]);
    updateDivisions();
}

function renderCompareChart(field, state) {
    const card = document.getElementById(COMPARE_CHARTS[field].id);
    card.querySelector('.chart-foot')?.remove();
    const valuesA = state.filteredA.map(d => d[field]).filter(v => v > 0);
    const valuesB = state.filteredB.map(d => d[field]).filter(v => v > 0);
    const result = renderHistogram(card, {
        field,
        series: [
            { id: 'a', values: valuesA, color: 'var(--race-a)', label: state.labelA },
            { id: 'b', values: valuesB, color: 'var(--race-b)', label: state.labelB },
        ],
        style: 'outline',
        yMode: 'percent',
        markers: {},
        medians: true,
        tooltip: document.getElementById('tooltip'),
    });

    if (result.series.length === 0) {
        card.querySelector('.chart-stats').innerHTML = '';
        card.querySelector('.chart-sub').innerHTML = '';
        d3.select(card).append('div').attr('class', 'no-data').text('No data for this division');
        return;
    }

    const [statsA, statsB] = result.series;
    const medianStat = (stats, className, label, color) => {
        if (!stats.n) {
            return `<span class="compare-median ${className}"><span class="race-dot" style="--dot:${color}"></span><span class="compare-median-label">${escapeHtml(label)}</span> No data</span>`;
        }
        const pace = formatPace(field, stats.q[1]);
        return `<span class="compare-median ${className}"><span class="race-dot" style="--dot:${color}"></span><span class="compare-median-label">${escapeHtml(label)}</span><strong>${formatChartTime(field, stats.q[1])}</strong>${pace ? ` <i class="pace">${pace}</i>` : ''}</span>`;
    };
    card.querySelector('.chart-stats').innerHTML =
        `${medianStat(statsA, 'race-a', state.labelA, 'var(--race-a)')}${medianStat(statsB, 'race-b', state.labelB, 'var(--race-b)')}`;

    let comparison = '';
    if (statsA.n && statsB.n) {
        const difference = Math.abs(statsA.q[1] - statsB.q[1]);
        if (difference >= 30) {
            const winner = statsA.q[1] < statsB.q[1] ? state.labelA : state.labelB;
            const winnerClass = statsA.q[1] < statsB.q[1] ? 'race-a' : 'race-b';
            comparison = `<span class="chart-note ${winnerClass}">${escapeHtml(winner)} typically ${formatDelta(difference)} faster</span>`;
        }
    }
    const outside = statsA.belowDomain + statsA.aboveDomain + statsB.belowDomain + statsB.aboveDomain;
    card.querySelector('.chart-sub').innerHTML = comparison;
    if (outside) {
        card.insertAdjacentHTML(
            'beforeend',
            `<div class="chart-foot">${outside.toLocaleString()} outlier${outside === 1 ? '' : 's'} excluded from view · included in statistics</div>`
        );
    }
}

function drawCharts() {
    const state = comparisonState();
    updateLegend(state);
    updateUrl(state);
    Object.keys(COMPARE_CHARTS).forEach(field => renderCompareChart(field, state));
}

async function init() {
    await loadRaces();
    const raceOptions = Object.entries(RACES).map(([value, race]) => ({ value, label: race.name }));
    const config = {
        searchEnabled: true,
        searchPlaceholderValue: 'Search races...',
        itemSelectText: '',
        shouldSort: false,
    };
    raceAChoices = new Choices('#race-a-select', { ...config, choices: raceOptions });
    raceBChoices = new Choices('#race-b-select', { ...config, choices: raceOptions });
    yearAChoices = new Choices('#year-a-select', { searchEnabled: false, itemSelectText: '', shouldSort: false });
    yearBChoices = new Choices('#year-b-select', { searchEnabled: false, itemSelectText: '', shouldSort: false });
    divisionChoices = new Choices('#division-select', {
        searchEnabled: true,
        searchPlaceholderValue: 'Search divisions...',
        itemSelectText: '',
        shouldSort: false,
    });

    const params = new URLSearchParams(window.location.search);
    const initialRaceA = RACES[params.get('race_a')] ? params.get('race_a') : 'north-carolina';
    const initialRaceB = RACES[params.get('race_b')] ? params.get('race_b') : 'new-york';
    raceAChoices.setChoiceByValue(initialRaceA);
    raceBChoices.setChoiceByValue(initialRaceB);
    updateYears('race-a-select', 'year-a-select');
    updateYears('race-b-select', 'year-b-select');
    if (RACES[initialRaceA].years.includes(params.get('year_a'))) yearAChoices.setChoiceByValue(params.get('year_a'));
    if (RACES[initialRaceB].years.includes(params.get('year_b'))) yearBChoices.setChoiceByValue(params.get('year_b'));

    await loadComparisonData();
    const divisionParam = params.get('division');
    if (divisionParam) divisionChoices.setChoiceByValue(divisionParam);
    drawCharts();

    for (const [raceId, yearId] of [['race-a-select', 'year-a-select'], ['race-b-select', 'year-b-select']]) {
        document.getElementById(raceId).addEventListener('change', async () => {
            updateYears(raceId, yearId);
            await loadComparisonData();
            drawCharts();
        });
        document.getElementById(yearId).addEventListener('change', async () => {
            await loadComparisonData();
            drawCharts();
        });
    }
    document.getElementById('division-select').addEventListener('change', drawCharts);
    observeHistogramCards(drawCharts);
}

init();
