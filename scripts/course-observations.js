const OBSERVED_SPLITS = ["swim", "t1", "bike", "t2", "run"];

function percentile(sorted, value) {
  if (!sorted.length || value <= 0) return null;
  let count = 0;
  while (count < sorted.length && sorted[count] <= value) count++;
  return Math.round((count / sorted.length) * 100);
}

function summarizeRaceYear(raceId, year, rows, splitColumns) {
  const finishers = rows.filter(row => Number(row[splitColumns.finish]) > 0);
  if (!finishers.length) return null;

  const medians = {};
  const coverage = {};
  for (const split of OBSERVED_SPLITS) {
    const values = finishers
      .map(row => Number(row[splitColumns[split]]))
      .filter(value => value > 0)
      .sort((a, b) => a - b);
    medians[split] = values.length ? values[Math.floor(values.length / 2)] : 0;
    coverage[split] = values.length / finishers.length;
  }

  return {
    raceId,
    year: String(year),
    athleteCount: finishers.length,
    medians,
    coverage,
  };
}

function buildCourseObservations(summaries, options = {}) {
  const minAthletes = options.minAthletes || 200;
  const minCoverage = options.minCoverage || 0.9;
  const eligible = summaries.filter(summary => summary.athleteCount >= minAthletes);
  const distributions = {};

  for (const split of OBSERVED_SPLITS) {
    distributions[split] = eligible
      .filter(summary => summary.coverage[split] >= minCoverage && summary.medians[split] > 0)
      .map(summary => summary.medians[split])
      .sort((a, b) => a - b);
  }

  const observations = {};
  for (const summary of summaries) {
    const signals = [];

    for (const split of OBSERVED_SPLITS) {
      if (
        summary.athleteCount < minAthletes ||
        summary.coverage[split] < minCoverage ||
        summary.medians[split] <= 0
      ) {
        continue;
      }

      const rank = percentile(distributions[split], summary.medians[split]);
      if (rank <= 10) signals.push({ split, direction: "fast", percentile: rank });
      if (rank >= 90) signals.push({ split, direction: "slow", percentile: rank });
    }

    if (!signals.length) continue;
    if (!observations[summary.raceId]) observations[summary.raceId] = {};
    observations[summary.raceId][summary.year] = {
      athleteCount: summary.athleteCount,
      signals,
    };
  }

  return {
    methodology: {
      comparisonUnit: "race-year median",
      minimumAthletes: minAthletes,
      minimumSplitCoverage: minCoverage,
      signalThresholds: {
        fastAtOrBelowPercentile: 10,
        slowAtOrAbovePercentile: 90
      },
      caveat: "Result distributions reflect both the course and the athletes who raced it."
    },
    races: observations,
  };
}

module.exports = {
  buildCourseObservations,
  percentile,
  summarizeRaceYear,
};
