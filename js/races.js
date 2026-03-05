// All Races Table View

let raceStats = {};
let sortColumn = 'name';
let sortAsc = true;

function renderTable() {
    const percentile = document.getElementById('percentile-select').value;
    const tbody = document.getElementById('race-table-body');
    const desc = document.getElementById('percentile-description');

    if (percentile === '50') {
        desc.textContent = 'Showing typical (median) split times for each race.';
    } else {
        desc.textContent = `Showing split times for the ${percentile}th percentile of finishers.`;
    }

    const rows = Object.entries(raceStats).map(([id, race]) => ({
        id,
        name: race.name,
        yearCount: race.yearCount,
        swim: race.deciles[percentile]?.swim || 0,
        t1: race.deciles[percentile]?.t1 || 0,
        bike: race.deciles[percentile]?.bike || 0,
        t2: race.deciles[percentile]?.t2 || 0,
        run: race.deciles[percentile]?.run || 0,
        finish: race.deciles[percentile]?.finish || 0,
    }));

    rows.sort((a, b) => {
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

    tbody.innerHTML = rows.map(r => `
        <tr>
            <td><a href="index.html?race=${r.id}">${r.name}</a></td>
            <td>${r.yearCount}</td>
            <td>${formatTime(r.swim)}</td>
            <td>${formatTime(r.t1)}</td>
            <td>${formatTime(r.bike)}</td>
            <td>${formatTime(r.t2)}</td>
            <td>${formatTime(r.run)}</td>
            <td>${formatTime(r.finish)}</td>
        </tr>
    `).join('');

    document.getElementById('stats').textContent = `${rows.length} races`;

    // Update sort arrows
    document.querySelectorAll('#race-table th').forEach(th => {
        const arrow = th.querySelector('.sort-arrow');
        if (th.dataset.sort === sortColumn) {
            arrow.textContent = sortAsc ? ' ▲' : ' ▼';
        } else {
            arrow.textContent = '';
        }
    });
}

async function init() {
    document.getElementById('stats').textContent = 'Loading...';

    const response = await fetch('results/race-stats.json');
    raceStats = await response.json();

    renderTable();

    document.getElementById('percentile-select').addEventListener('change', renderTable);

    document.querySelectorAll('#race-table th[data-sort]').forEach(th => {
        th.addEventListener('click', () => {
            const col = th.dataset.sort;
            if (sortColumn === col) {
                sortAsc = !sortAsc;
            } else {
                sortColumn = col;
                sortAsc = true;
            }
            renderTable();
        });
    });
}

init();
