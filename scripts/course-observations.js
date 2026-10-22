const OBSERVED_SPLITS = ["swim", "t1", "bike", "t2", "run"];
// World Championship venues rotate, so neither a course nor a "usual" year exists.
const ROTATING_VENUE = /^world-championship/;

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

// A race's typical split is the median of its eligible race-year medians,
// skipping years where that leg looks shortened. Course signals rank these
// per-race values against every other race, so they do not change by year.
function buildCourseObservations(summaries, options = {}) {
  const minAthletes = options.minAthletes || 200;
  const minCoverage = options.minCoverage || 0.9;
  const minOtherYears = options.minOtherYears || 3;
  const eligible = summaries.filter(summary => summary.athleteCount >= minAthletes && !ROTATING_VENUE.test(summary.raceId));
  const byRace = {};
  for (const summary of eligible) {
    (byRace[summary.raceId] ||= []).push(summary);
  }

  const races = {};
  const courseValues = {};
  for (const [raceId, raceYears] of Object.entries(byRace)) {
    const yearSignals = {};
    for (const summary of raceYears) {
      const signals = buildYearSignals(summary, raceYears, { minCoverage, minOtherYears });
      if (signals.length) yearSignals[summary.year] = signals;
    }
    const typical = {};
    for (const split of OBSERVED_SPLITS) {
      const values = raceYears
        .filter(summary => summary.coverage[split] >= minCoverage && summary.medians[split] > 0)
        .filter(summary => !yearSignals[summary.year]?.some(signal => signal.split === split && signal.likelyShortened))
        .map(summary => summary.medians[split]);
      if (!values.length) continue;
      typical[split] = median(values);
      (courseValues[split] ||= []).push(typical[split]);
    }
    races[raceId] = { typical, years: raceYears.length, yearSignals };
  }
  for (const split of OBSERVED_SPLITS) (courseValues[split] ||= []).sort((a, b) => a - b);

  const courses = {};
  const observations = {};
  for (const [raceId, race] of Object.entries(races)) {
    const signals = [];
    for (const split of OBSERVED_SPLITS) {
      if (!race.typical[split]) continue;
      const rank = percentile(courseValues[split], race.typical[split]);
      if (rank <= 10) signals.push({ split, direction: "fast", percentile: rank });
      if (rank >= 90) signals.push({ split, direction: "slow", percentile: rank });
    }
    if (signals.length) courses[raceId] = { years: race.years, signals };
    for (const [year, yearSignals] of Object.entries(race.yearSignals)) {
      (observations[raceId] ||= {})[year] = { yearSignals };
    }
  }

  return {
    methodology: {
      comparisonUnit: "race (median of race-year medians) vs. all races; race-year vs. same race's other years",
      minimumAthletes: minAthletes,
      minimumSplitCoverage: minCoverage,
      courseSignalThresholds: {
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
    courses,
    races: observations,
  };
}

module.exports = {
  buildCourseObservations,
  buildYearSignals,
  percentile,
  summarizeRaceYear,
};
