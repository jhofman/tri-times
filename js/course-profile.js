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
        return feet ? `${Number(feet).toLocaleString()} ft gain` : null;
    }

    function formatLaps(value) {
        if (!value) return null;
        return `${value} ${Number(value) === 1 ? 'lap' : 'laps'}`;
    }

    function buildLegDetails(profile, edition) {
        return [
            {
                label: 'Swim',
                primary: profile.swimType,
                details: [
                    edition?.swimDistanceMi ? `${edition.swimDistanceMi} mi` : null,
                    formatLaps(edition?.swimLaps),
                ].filter(Boolean),
            },
            {
                label: 'Bike',
                primary: profile.bikeTerrain,
                details: [
                    formatElevation(edition?.bikeElevationGainFt),
                    formatLaps(edition?.bikeLaps),
                ].filter(Boolean),
            },
            {
                label: 'Run',
                primary: profile.runTerrain,
                details: [
                    formatElevation(edition?.runElevationGainFt),
                    formatLaps(edition?.runLaps),
                ].filter(Boolean),
            },
        ].filter(leg => leg.primary || leg.details.length);
    }

    function buildConditions(profile) {
        return [
            profile.typicalHighAirF ? `Typical high ${profile.typicalHighAirF}°F` : null,
            profile.typicalLowAirF ? `Typical low ${profile.typicalLowAirF}°F` : null,
            profile.typicalWaterF ? `Typical water ${profile.typicalWaterF}°F` : null,
        ].filter(Boolean);
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
            .map(signal => {
                const tail = signal.direction === 'fast'
                    ? `fastest ${signal.percentile}%`
                    : `slowest ${Math.max(1, 100 - signal.percentile)}%`;
                return `${SPLIT_LABELS[signal.split]} median is among the ${tail} of race-years`;
            });
    }

    return {
        buildConditions,
        buildLegDetails,
        formatObservationSignals,
        selectEdition,
    };
}));
