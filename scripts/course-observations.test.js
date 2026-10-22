const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildCourseObservations,
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

test("buildCourseObservations emits only well-supported tail signals", () => {
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

  assert.deepEqual(result.races["race-0"]["2025"].signals, [
    { split: "swim", direction: "fast", percentile: 10 },
    { split: "t1", direction: "fast", percentile: 10 },
    { split: "bike", direction: "fast", percentile: 10 },
    { split: "t2", direction: "fast", percentile: 10 },
    { split: "run", direction: "fast", percentile: 10 },
  ]);
  assert.equal(result.races["race-9"]["2025"].signals.length, 5);
  assert.equal(result.races["small-race"], undefined);
});
