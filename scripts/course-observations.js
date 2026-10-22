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

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
}

// Compare a race-year to the same race's other years. Only large differences
// are emitted; a much faster leg usually means a shortened course.
function buildYearSignals(summary, siblings, options) {
  const signals = [];
  for (const split of OBSERVED_SPLITS) {
    if (summary.coverage[split] < options.minCoverage || summary.medians[split] <= 0) continue;
    const others = siblings
      .filter(other => other.year !== summary.year && other.coverage[split] >= options.minCoverage && other.medians[split] > 0)
      .map(other => other.medians[split]);
    if (others.length < Math.min(2, options.minOtherYears)) continue;

    const typical = median(others);
    const delta = summary.medians[split] - typical;
    const isTransition = split === "t1" || split === "t2";
    const relative = Math.abs(delta) / typical;
    const likelyShortened = !isTransition && delta / typical <= -0.25;
    if (!likelyShortened && others.length < options.minOtherYears) continue;
    if (relative < (isTransition ? 0.15 : 0.05) || Math.abs(delta) < (isTransition ? 30 : 60)) continue;

    signals.push({
      split,
      deltaSeconds: Math.round(delta),
      typicalSeconds: Math.round(typical),
      otherYears: others.length,
      ...(likelyShortened ? { likelyShortened: true } : {}),
    });
  }
  return signals;
}

function buildCourseObservations(summaries, options = {}) {
  const minAthletes = options.minAthletes || 200;
  const minCoverage = options.minCoverage || 0.9;
  const minOtherYears = options.minOtherYears || 3;
  const eligible = summaries.filter(summary => summary.athleteCount >= minAthletes);
  const distributions = {};
  const byRace = {};
  for (const summary of eligible) {
    (byRace[summary.raceId] ||= []).push(summary);
  }

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

    const yearSignals = summary.athleteCount >= minAthletes
      ? buildYearSignals(summary, byRace[summary.raceId], { minCoverage, minOtherYears })
      : [];

    if (!signals.length && !yearSignals.length) continue;
    if (!observations[summary.raceId]) observations[summary.raceId] = {};
    observations[summary.raceId][summary.year] = {
      athleteCount: summary.athleteCount,
      signals,
      ...(yearSignals.length ? { yearSignals } : {}),
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
      yearSignalThresholds: {
        minimumOtherYears: minOtherYears,
        likelyShortenedMinimumOtherYears: 2,
        legRelativeChange: 0.05,
        legMinimumSeconds: 60,
        transitionRelativeChange: 0.15,
        transitionMinimumSeconds: 30,
        likelyShortenedLegChange: -0.25
      },
      caveat: "Result distributions reflect both the course and the athletes who raced it."
    },
    races: observations,
  };
}

module.exports = {
  buildCourseObservations,
  buildYearSignals,
  percentile,
  summarizeRaceYear,
};
