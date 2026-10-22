(function(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.CourseProfile = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function() {
    const SPLIT_LABELS = {
        swim: 'Swim',
        t1: 'T1',
        bike: 'Bike',
        t2: 'T2',
        run: 'Run',
    };

    // Font Awesome Free (solid) icon names
    const LEG_ICONS = {
        Swim: 'person-swimming',
        Bike: 'person-biking',
        Run: 'person-running',
    };
    const TERRAIN_ICONS = {
        flat: 'minus',
        rolling: 'mound',
        hilly: 'mountain',
    };
    const FEATURE_ICONS = [
        [/current|downriver|tidal/i, 'forward'],
        [/T1 and T2|transition/i, 'location-dot'],
        [/climb/i, 'mountain'],
        [/descent/i, 'triangle-exclamation'],
        [/closed/i, 'road-barrier'],
        [/out-and-back/i, 'arrows-left-right'],
        [/loop/i, 'rotate'],
        [/longer|distance/i, 'ruler-horizontal'],
        [/swim/i, 'water'],
    ];

    function terrainIcon(value) {
        return TERRAIN_ICONS[String(value || '').toLowerCase()] || null;
    }

    function featureIcon(text) {
        const match = FEATURE_ICONS.find(([pattern]) => pattern.test(text));
        return match ? match[1] : 'circle-info';
    }

    function selectEdition(metadata, selectedYear) {
        const editions = metadata?.editions || {};
        if (editions[selectedYear]) {
            return { year: selectedYear, data: editions[selectedYear], exact: true };
        }

        const years = Object.keys(editions).sort((a, b) => Number(b) - Number(a));
        if (!years.length) return null;
        return { year: years[0], data: editions[years[0]], exact: false };
    }

    function formatElevation(feet) {
        return feet ? { text: `${Number(feet).toLocaleString()} ft gain`, icon: 'arrow-trend-up' } : null;
    }

    function formatLaps(value) {
        if (!value) return null;
        return { text: `${value} ${Number(value) === 1 ? 'lap' : 'laps'}`, icon: 'rotate' };
    }

    function buildLeg(label, primary, primaryIcon, details) {
        return {
            label,
            icon: LEG_ICONS[label],
            primary,
            primaryIcon: primary ? primaryIcon : null,
            details: details.filter(Boolean),
        };
    }

    function buildLegDetails(profile, edition) {
        return [
            buildLeg('Swim', profile.swimType, 'water', [
                edition?.swimDistanceMi ? { text: `${edition.swimDistanceMi} mi`, icon: 'ruler-horizontal' } : null,
                formatLaps(edition?.swimLaps),
                profile.typicalWaterF ? {
                    text: `${profile.typicalWaterF}°F water`,
                    icon: 'temperature-half',
                    title: 'Average water temperature from the official race page (typical, not race-day)',
                } : null,
            ]),
            buildLeg('Bike', profile.bikeTerrain, terrainIcon(profile.bikeTerrain), [
                formatElevation(edition?.bikeElevationGainFt),
                formatLaps(edition?.bikeLaps),
            ]),
            buildLeg('Run', profile.runTerrain, terrainIcon(profile.runTerrain), [
                formatElevation(edition?.runElevationGainFt),
                formatLaps(edition?.runLaps),
            ]),
        ].filter(leg => leg.primary || leg.details.length);
    }

    function buildConditions(profile) {
        const { typicalLowAirF: low, typicalHighAirF: high } = profile;
        if (!low && !high) return null;
        const text = low && high ? `Air ${low}–${high}°F` : `Air ${high ? 'high' : 'low'} ${high || low}°F`;
        return { text, icon: 'temperature-half', title: 'Typical air temperature range from the official race page (not race-day readings)' };
    }

    function buildFeatures(features) {
        return (features || []).map(text => ({ text, icon: featureIcon(text) }));
    }

    function describeSignal(signal, years) {
        const fast = signal.direction === 'fast';
        const tail = fast ? signal.percentile : Math.max(1, 100 - signal.percentile);
        const label = SPLIT_LABELS[signal.split];
        const isTransition = signal.split === 't1' || signal.split === 't2';
        const word = isTransition ? (fast ? 'quick' : 'long') : (fast ? 'fast' : 'slow');
        const strength = tail <= 3 ? 'Very ' + word : word[0].toUpperCase() + word.slice(1);
        return {
            text: isTransition ? `${strength} ${label} setup` : `${strength} ${label.toLowerCase()} course`,
            short: isTransition ? `${strength} setup` : `${strength} course`,
            split: signal.split,
            kind: 'course',
            icon: fast ? 'bolt' : 'hourglass-half',
            direction: signal.direction,
            title: `Typical ${label.startsWith('T') ? label : label.toLowerCase()} median${years > 1 ? ` across ${years} years` : ''} is among the ${fast ? 'fastest' : 'slowest'} ${tail}% of 70.3 races. Inferred from results; unadjusted for field strength.`,
        };
    }

    function formatDuration(seconds) {
        const abs = Math.abs(seconds);
        if (abs < 90) return `${Math.round(abs)} sec`;
        return `${Math.round(abs / 60)} min`;
    }

    function formatClock(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = String(Math.round(seconds % 60)).padStart(2, '0');
        return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
    }

    function describeYearSignal(signal, year, raceName) {
        const label = SPLIT_LABELS[signal.split];
        const name = signal.split.startsWith('t') ? label : label.toLowerCase();
        const actual = signal.typicalSeconds + signal.deltaSeconds;
        const context = `${year} median ${formatClock(actual)} vs. ${formatClock(signal.typicalSeconds)} typical across ${signal.otherYears} other ${raceName || 'race'} years.`;
        if (signal.likelyShortened) {
            return {
                text: `${year} ${name} much faster than usual`,
                short: 'Much faster than usual',
                chartText: `Much faster than usual in ${year}`,
                split: signal.split,
                kind: 'year',
                typicalSeconds: signal.typicalSeconds,
                icon: 'triangle-exclamation',
                direction: 'shortened',
                title: `${context} A gap this large often means a shortened or altered course, a strong current, or a timing issue.`,
            };
        }
        const slower = signal.deltaSeconds > 0;
        const isTransition = signal.split === 't1' || signal.split === 't2';
        const word = isTransition ? (slower ? 'longer' : 'quicker') : (slower ? 'slower' : 'faster');
        return {
            text: `${year} ${name} ${formatDuration(signal.deltaSeconds)} ${word} than usual`,
            short: `${slower ? '+' : '−'}${formatDuration(signal.deltaSeconds)} vs usual`,
            chartText: `${formatDuration(signal.deltaSeconds)} ${word} than usual in ${year}`,
            split: signal.split,
            kind: 'year',
            typicalSeconds: signal.typicalSeconds,
            icon: slower ? 'arrow-up' : 'arrow-down',
            direction: slower ? 'slow' : 'fast',
            title: `${context} Unadjusted for weather or field strength.`,
        };
    }

    function formatYearSignals(observation, year, raceName, limit = 5) {
        if (!observation?.yearSignals?.length) return [];
        return [...observation.yearSignals]
            .sort((a, b) => Math.abs(b.deltaSeconds / b.typicalSeconds) - Math.abs(a.deltaSeconds / a.typicalSeconds))
            .slice(0, limit)
            .map(signal => describeYearSignal(signal, year, raceName));
    }

    function formatObservationSignals(course, limit = 5) {
        if (!course?.signals?.length) return [];
        const priority = { t1: 0, t2: 1, swim: 2, bike: 3, run: 4 };
        return [...course.signals]
            .sort((a, b) => {
                const extremityA = Math.min(a.percentile, 100 - a.percentile);
                const extremityB = Math.min(b.percentile, 100 - b.percentile);
                return extremityA - extremityB || priority[a.split] - priority[b.split];
            })
            .slice(0, limit)
            .map(signal => describeSignal(signal, course.years));
    }

    return {
        buildConditions,
        buildFeatures,
        buildLegDetails,
        formatObservationSignals,
        formatYearSignals,
        selectEdition,
    };
}));
