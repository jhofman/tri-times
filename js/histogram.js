const HISTOGRAM_BIN_WIDTHS = [10, 15, 20, 30, 60, 90, 120, 180, 300, 600, 900];

function nearestBinWidth(rawWidth) {
    return HISTOGRAM_BIN_WIDTHS.reduce((best, candidate) =>
        Math.abs(candidate - rawWidth) < Math.abs(best - rawWidth) ? candidate : best
    );
}

function chooseBinWidth(visibleMin, visibleMax, targetBins) {
    if (visibleMax === visibleMin) return nearestBinWidth(HISTOGRAM_BIN_WIDTHS[0]);
    const candidates = HISTOGRAM_BIN_WIDTHS.map(width => {
        const start = Math.max(0, Math.floor(visibleMin / width) * width);
        const end = Math.ceil(visibleMax / width) * width;
        return { width, count: Math.max(1, Math.round((end - start) / width)) };
    }).filter(candidate => candidate.count <= 40);
    return candidates.reduce((best, candidate) => {
        const difference = Math.abs(candidate.count - targetBins);
        const bestDifference = Math.abs(best.count - targetBins);
        return difference < bestDifference ? candidate : best;
    }).width;
}

function positionHistogramTooltip(tooltip, event) {
    const node = tooltip.node();
    const margin = 12;
    let left = event.clientX + margin;
    let top = event.clientY - margin;
    const width = node.offsetWidth;
    const height = node.offsetHeight;
    if (left + width > window.innerWidth - margin) left = event.clientX - width - margin;
    if (top + height > window.innerHeight - margin) top = window.innerHeight - height - margin;
    tooltip.style('left', `${Math.max(margin, left)}px`)
        .style('top', `${Math.max(margin, top)}px`);
}

function showHistogramTooltip(tooltip, event, html) {
    tooltip.classed('visible', true).html(html);
    positionHistogramTooltip(tooltip, event);
}

function histogramPace(field, value) {
    const pace = formatPace(field, value);
    return pace ? ` · ${pace}` : '';
}

function renderHistogram(card, opts) {
    const container = d3.select(card);
    container.select('svg').remove();
    container.select('.no-data').remove();

    const field = opts.field;
    const series = opts.series.map(item => ({
        ...item,
        values: item.values.filter(value => Number.isFinite(value) && value > 0).sort((a, b) => a - b),
    }));
    const allValues = series.flatMap(item => item.values).sort((a, b) => a - b);
    if (allValues.length === 0) return { series: [], binWidth: 0 };

    let visibleMin = allValues[0];
    let visibleMax = allValues[allValues.length - 1];
    if (allValues.length >= 200) {
        visibleMin = d3.quantileSorted(allValues, 0.005);
        visibleMax = d3.quantileSorted(allValues, 0.995);
    }
    const athleteValue = opts.markers?.athlete?.value;
    if (Number.isFinite(athleteValue) && athleteValue > 0) {
        visibleMin = Math.min(visibleMin, athleteValue);
        visibleMax = Math.max(visibleMax, athleteValue);
    }

    const targetBins = Math.max(12, Math.min(40, Math.round(1.6 * Math.sqrt(allValues.length))));
    const binWidth = chooseBinWidth(visibleMin, visibleMax, targetBins);
    const isSingleValue = visibleMax === visibleMin;
    let domainStart = isSingleValue
        ? Math.max(0, visibleMin - binWidth / 2)
        : Math.max(0, Math.floor(visibleMin / binWidth) * binWidth);
    let domainEnd = isSingleValue
        ? domainStart + binWidth
        : Math.ceil(visibleMax / binWidth) * binWidth;
    if (domainEnd <= domainStart) domainEnd = domainStart + binWidth;
    const domain = [domainStart, domainEnd];
    const thresholds = d3.range(domainStart + binWidth, domainEnd, binWidth);
    const bin = d3.bin().domain(domain).thresholds(thresholds);

    const stats = series.map(item => {
        const bins = bin(item.values);
        const q = [
            nearestRank(item.values, 0.25),
            nearestRank(item.values, 0.5),
            nearestRank(item.values, 0.75),
        ];
        const athletePct = Number.isFinite(athleteValue) && item.values.length
            ? Math.round((d3.bisectRight(item.values, athleteValue) / item.values.length) * 100)
            : null;
        return {
            ...item,
            bins,
            n: item.values.length,
            q,
            athletePct,
            belowDomain: d3.bisectLeft(item.values, domainStart),
            aboveDomain: item.values.length - d3.bisectRight(item.values, domainEnd),
        };
    });

    const width = Math.max(240, card.clientWidth - 32);
    const height = 200;
    const margin = { top: 8, right: 8, bottom: 26, left: 36 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    const x = d3.scaleLinear().domain(domain).range([0, innerWidth]);
    const metric = (count, n) => opts.yMode === 'percent' ? count / Math.max(n, 1) : count;
    const yMax = d3.max(stats, item => d3.max(item.bins, b => metric(b.length, item.n))) || 1;
    const y = d3.scaleLinear().domain([0, yMax]).nice(4).range([innerHeight, 0]);
    const tooltip = d3.select(opts.tooltip);
    const interactiveMarkers = [];

    const accessibleStats = stats.find(item => item.n) || stats[0];
    const svg = container.append('svg')
        .attr('width', width)
        .attr('height', height)
        .attr('viewBox', `0 0 ${width} ${height}`)
        .attr('role', 'img')
        .attr('aria-label', `${field} histogram, median ${formatChartTime(field, accessibleStats.q[1])}`);
    svg.append('title').text(`${field} time distribution`);
    svg.append('desc').text(`Median ${formatChartTime(field, accessibleStats.q[1])}.`);
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const yAxis = d3.axisLeft(y)
        .ticks(4)
        .tickSize(-innerWidth)
        .tickFormat(opts.yMode === 'percent' ? d3.format('.0%') : d3.format('d'));
    g.append('g').attr('class', 'grid axis').call(yAxis);
    g.append('g')
        .attr('class', 'axis')
        .attr('transform', `translate(0,${innerHeight})`)
        .call(d3.axisBottom(x).tickValues(timeTicks(domain, 5)).tickFormat(value => formatChartTime(field, value)));

    if (opts.markers?.band && stats[0].q[0] && stats[0].q[2]) {
        g.append('rect')
            .attr('class', 'iqr-band')
            .attr('x', x(stats[0].q[0]))
            .attr('width', Math.max(0, x(stats[0].q[2]) - x(stats[0].q[0])))
            .attr('height', innerHeight)
            .attr('fill', stats[0].color);
    }

    stats.forEach(item => {
        const points = item.bins.map(b => ({
            x: b.x0,
            y: metric(b.length, item.n),
        }));
        const last = item.bins[item.bins.length - 1];
        points.push({ x: last.x1, y: metric(last.length, item.n) });
        const area = d3.area()
            .x(d => x(d.x))
            .y0(innerHeight)
            .y1(d => y(d.y))
            .curve(d3.curveStepAfter);
        const line = d3.line()
            .x(d => x(d.x))
            .y(d => y(d.y))
            .curve(d3.curveStepAfter);
        g.append('path')
            .datum(points)
            .attr('d', area)
            .attr('fill', item.color)
            .attr('fill-opacity', 0.18);
        g.append('path')
            .datum(points)
            .attr('class', 'histogram-outline')
            .attr('d', line)
            .attr('fill', 'none')
            .attr('stroke', item.color);
    });

    if (opts.markers?.quartiles) {
        const labels = ['25th percentile', 'Median', '75th percentile'];
        stats[0].q.forEach((value, index) => {
            const marker = g.append('g');
            interactiveMarkers.push(marker);
            marker.append('line')
                .attr('class', 'quartile-line')
                .attr('x1', x(value)).attr('x2', x(value))
                .attr('y1', 0).attr('y2', innerHeight);
            marker.append('line')
                .attr('x1', x(value)).attr('x2', x(value))
                .attr('y1', 0).attr('y2', innerHeight)
                .attr('stroke', 'transparent')
                .attr('stroke-width', 10)
                .on('mouseenter', event => showHistogramTooltip(
                    tooltip,
                    event,
                    `<div class="time-range">${labels[index]}</div><div>${formatChartTime(field, value)}${histogramPace(field, value)}</div>`
                ))
                .on('mousemove', event => positionHistogramTooltip(tooltip, event))
                .on('mouseleave', () => tooltip.classed('visible', false));
        });
    }

    if (opts.medians) {
        stats.forEach(item => {
            if (!item.n) return;
            g.append('line')
                .attr('class', 'median-line')
                .attr('x1', x(item.q[1])).attr('x2', x(item.q[1]))
                .attr('y1', 0).attr('y2', innerHeight)
                .attr('stroke', item.color);
        });
    }

    if (opts.markers?.athlete && Number.isFinite(athleteValue)) {
        const athlete = opts.markers.athlete;
        const athleteX = x(athleteValue);
        const marker = g.append('g');
        interactiveMarkers.push(marker);
        marker.append('line')
            .attr('class', 'athlete-marker')
            .attr('x1', athleteX).attr('x2', athleteX)
            .attr('y1', -4).attr('y2', innerHeight);
        marker.append('path')
            .attr('class', 'athlete-pointer')
            .attr('d', `M${athleteX - 4},-4 L${athleteX + 4},-4 L${athleteX},2 Z`);
        marker.append('line')
            .attr('x1', athleteX).attr('x2', athleteX)
            .attr('y1', -4).attr('y2', innerHeight)
            .attr('stroke', 'transparent')
            .attr('stroke-width', 12)
            .on('mouseenter', event => showHistogramTooltip(
                tooltip,
                event,
                `<div class="time-range">${escapeHtml(athlete.name)}</div><div>${formatChartTime(field, athleteValue)}${histogramPace(field, athleteValue)}</div><div class="percentile">${stats[0].athletePct}% percentile in ${escapeHtml(athlete.division)}</div>`
            ))
            .on('mousemove', event => positionHistogramTooltip(tooltip, event))
            .on('mouseleave', () => tooltip.classed('visible', false));
    }

    const hoverGroups = stats.map(item => g.append('g'));
    const referenceBins = stats[0].bins;
    referenceBins.forEach((referenceBin, binIndex) => {
        stats.forEach((item, seriesIndex) => {
            const itemBin = item.bins[binIndex];
            hoverGroups[seriesIndex].append('rect')
                .attr('class', 'hover-bin')
                .attr('x', x(itemBin.x0))
                .attr('y', y(metric(itemBin.length, item.n)))
                .attr('width', Math.max(0, x(itemBin.x1) - x(itemBin.x0)))
                .attr('height', innerHeight - y(metric(itemBin.length, item.n)))
                .attr('fill', item.color)
                .attr('fill-opacity', 0.35);
        });
        g.append('rect')
            .attr('class', 'hit-bin')
            .attr('x', x(referenceBin.x0))
            .attr('width', Math.max(1, x(referenceBin.x1) - x(referenceBin.x0)))
            .attr('height', innerHeight)
            .on('mouseenter', function (event) {
                hoverGroups.forEach(group => group.selectAll('.hover-bin').style('opacity', 0));
                hoverGroups.forEach(group => group.selectAll('.hover-bin').filter((_, i) => i === binIndex).style('opacity', 1));
                const range = `${formatChartTime(field, referenceBin.x0)} – ${formatChartTime(field, referenceBin.x1)}`;
                const paceStart = formatPace(field, referenceBin.x0);
                const paceEnd = formatPace(field, referenceBin.x1);
                const lines = stats.map(item => {
                    const itemBin = item.bins[binIndex];
                    const pct = item.n ? Math.round(itemBin.length / item.n * 100) : 0;
                    return `<div class="count"><strong style="color:${item.color}">${escapeHtml(item.label)}</strong> ${itemBin.length.toLocaleString()} (${pct}%)</div>`;
                }).join('');
                let detail = lines;
                if (stats.length === 1) {
                    const low = Math.round(d3.bisectLeft(stats[0].values, referenceBin.x0) / stats[0].n * 100);
                    const high = Math.round(d3.bisectRight(stats[0].values, referenceBin.x1) / stats[0].n * 100);
                    detail += `<div class="percentile">${low === high ? `${high}th percentile` : `${low}th–${high}th percentile`}</div>`;
                }
                const paceRange = paceStart && paceEnd ? `<div>${paceStart} – ${paceEnd}</div>` : '';
                showHistogramTooltip(tooltip, event, `<div class="time-range">${range}</div>${paceRange}${detail}`);
            })
            .on('mousemove', event => positionHistogramTooltip(tooltip, event))
            .on('mouseleave', () => {
                hoverGroups.forEach(group => group.selectAll('.hover-bin').style('opacity', 0));
                tooltip.classed('visible', false);
            });
    });
    interactiveMarkers.forEach(marker => marker.raise());

    return { series: stats, binWidth };
}

function observeHistogramCards(callback) {
    let timer;
    const observer = new ResizeObserver(() => {
        clearTimeout(timer);
        timer = setTimeout(callback, 100);
    });
    document.querySelectorAll('.chart-container').forEach(card => observer.observe(card));
    return observer;
}
