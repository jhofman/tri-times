const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildCourseObservations,
  buildYearSignals,
  percentile,
  summarizeRaceYear,
} = require("./course-observations");

const COLUMNS = {
  swim: "swim",
  t1: "t1",
  bike: "bike",
  t2: "t2",
  run: "run",
  finish: "finish",
};

test("summarizeRaceYear uses finishers and records split coverage", () => {
  const summary = summarizeRaceYear("example", 2025, [
    { swim: 100, t1: 10, bike: 300, t2: 8, run: 200, finish: 618 },
    { swim: 120, t1: 12, bike: 320, t2: 0, run: 220, finish: 672 },
    { swim: 90, t1: 9, bike: 280, t2: 7, run: 190, finish: 0 },
  ], COLUMNS);

  assert.equal(summary.athleteCount, 2);
  assert.equal(summary.medians.swim, 120);
  assert.equal(summary.coverage.t2, 0.5);
});

test("percentile includes tied values at or below the observation", () => {
  assert.equal(percentile([10, 20, 20, 30], 20), 75);
  assert.equal(percentile([], 20), null);
});

test("course signals rank each race's typical split against other races", () => {
  const summaries = Array.from({ length: 10 }, (_, index) => ({
    raceId: `race-${index}`,
    year: "2025",
    athleteCount: 300,
    medians: {
      swim: 100 + index * 10,
      t1: 20 + index,
      bike: 300 + index * 10,
      t2: 15 + index,
      run: 200 + index * 10,
    },
    coverage: { swim: 1, t1: 1, bike: 1, t2: 1, run: 1 },
  }));
  summaries.push({
    raceId: "small-race",
    year: "2025",
    athleteCount: 50,
    medians: { swim: 1, t1: 1, bike: 1, t2: 1, run: 1 },
    coverage: { swim: 1, t1: 1, bike: 1, t2: 1, run: 1 },
  });

  const result = buildCourseObservations(summaries);

  assert.deepEqual(result.courses["race-0"].signals, [
    { split: "swim", direction: "fast", percentile: 10 },
    { split: "t1", direction: "fast", percentile: 10 },
    { split: "bike", direction: "fast", percentile: 10 },
    { split: "t2", direction: "fast", percentile: 10 },
    { split: "run", direction: "fast", percentile: 10 },
  ]);
  assert.equal(result.courses["race-9"].signals.length, 5);
  assert.equal(result.courses["race-5"], undefined);
  assert.equal(result.courses["small-race"], undefined);
});

test("year signals compare a race-year to the same race's other years", () => {
  const year = (y, swim, bike, t1) => ({
    raceId: "r", year: y, athleteCount: 300,
    medians: { swim, t1, bike, t2: 300, run: 7000 },
    coverage: { swim: 1, t1: 1, bike: 1, t2: 1, run: 1 },
  });
  const options = { minCoverage: 0.9, minOtherYears: 3 };
  const siblings = [year("2021", 2000, 11000, 500), year("2022", 2020, 11050, 510), year("2023", 1990, 10950, 505)];

  const slow = year("2024", 2010, 11800, 620);
  assert.deepEqual(buildYearSignals(slow, [...siblings, slow], options), [
    { split: "t1", deltaSeconds: 115, typicalSeconds: 505, otherYears: 3 },
    { split: "bike", deltaSeconds: 800, typicalSeconds: 11000, otherYears: 3 },
  ]);

  // Two other years suffice only for the much-faster (likely shortened) check.
  const shortened = year("2024", 900, 11020, 505);
  const twoSiblings = siblings.slice(0, 2);
  assert.deepEqual(buildYearSignals(shortened, [...twoSiblings, shortened], options), [
    { split: "swim", deltaSeconds: -1120, typicalSeconds: 2020, otherYears: 2, likelyShortened: true },
  ]);
});

test("course signals use the median across years and ignore shortened legs", () => {
  const summary = (raceId, year, swim, step = 4.5) => ({
    raceId,
    year,
    athleteCount: 300,
    medians: { swim, t1: 300 + step * 10, bike: 10000 + step * 100, t2: 200 + step * 10, run: 7000 + step * 100 },
    coverage: { swim: 1, t1: 1, bike: 1, t2: 1, run: 1 },
  });
  const summaries = Array.from({ length: 9 }, (_, index) => summary(`race-${index}`, "2025", 2000 + index * 100, index));
  // Typical 1700 is the fastest; the shortened 2023 swim and a slow 2024 year do not move it.
  summaries.push(
    summary("fast-race", "2021", 1700),
    summary("fast-race", "2022", 1700),
    summary("fast-race", "2023", 600),
    summary("fast-race", "2024", 2500),
  );

  const result = buildCourseObservations(summaries);

  assert.deepEqual(result.courses["fast-race"], {
    years: 4,
    signals: [{ split: "swim", direction: "fast", percentile: 10 }],
  });
  assert.equal(result.races["fast-race"]["2023"].yearSignals[0].likelyShortened, true);
});

test("rotating World Championship venues get no course or year signals", () => {
  const summaries = Array.from({ length: 10 }, (_, index) => ({
    raceId: index ? `race-${index}` : "world-championship-2026",
    year: "2025",
    athleteCount: 300,
    medians: { swim: 100 + index, t1: 20 + index, bike: 300 + index, t2: 15 + index, run: 200 + index },
    coverage: { swim: 1, t1: 1, bike: 1, t2: 1, run: 1 },
  }));

  const result = buildCourseObservations(summaries);

  assert.equal(result.courses["world-championship-2026"], undefined);
  assert.equal(result.courses["race-9"].signals[0].direction, "slow");
});
