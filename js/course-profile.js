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
                profile.typicalWaterF ? { text: `${profile.typicalWaterF}°F water`, icon: 'temperature-half' } : null,
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
        return { text, icon: 'temperature-half', title: 'Typical air temperature range (climate values, not race-day readings)' };
    }

    function buildFeatures(features) {
        return (features || []).map(text => ({ text, icon: featureIcon(text) }));
    }

    function describeSignal(signal) {
        const fast = signal.direction === 'fast';
        const tail = fast ? signal.percentile : Math.max(1, 100 - signal.percentile);
        const label = SPLIT_LABELS[signal.split];
        const isTransition = signal.split === 't1' || signal.split === 't2';
        const word = isTransition ? (fast ? 'quick' : 'long') : (fast ? 'fast' : 'slow');
        const strength = tail <= 3 ? 'Very ' + word : word[0].toUpperCase() + word.slice(1);
        return {
            text: `${strength} ${isTransition ? label : label.toLowerCase()}`,
            icon: fast ? 'bolt' : 'hourglass-half',
            direction: signal.direction,
            title: `${label} median is among the ${fast ? 'fastest' : 'slowest'} ${tail}% of race-years. Inferred from results; unadjusted for field strength.`,
        };
    }

    function formatObservationSignals(observation, limit = 3) {
        if (!observation?.signals?.length) return [];
        return [...observation.signals]
            .sort((a, b) => {
                const priority = { t1: 0, t2: 1, swim: 2, bike: 3, run: 4 };
                const extremityA = Math.min(a.percentile, 100 - a.percentile);
                const extremityB = Math.min(b.percentile, 100 - b.percentile);
                return extremityA - extremityB || priority[a.split] - priority[b.split];
            })
            .slice(0, limit)
            .map(describeSignal);
    }

    return {
        buildConditions,
        buildFeatures,
        buildLegDetails,
        formatObservationSignals,
        selectEdition,
    };
}));
