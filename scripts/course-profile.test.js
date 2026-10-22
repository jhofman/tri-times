const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildConditions,
  buildLegDetails,
  formatObservationSignals,
  selectEdition,
} = require("../js/course-profile");

test("selectEdition prefers an exact year and otherwise uses the latest guide", () => {
  const metadata = {
    editions: {
      "2024": { bikeLaps: 1 },
      "2025": { bikeLaps: 2 },
    },
  };

  assert.deepEqual(selectEdition(metadata, "2024"), {
    year: "2024",
    data: { bikeLaps: 1 },
    exact: true,
  });
  assert.deepEqual(selectEdition(metadata, "2026"), {
    year: "2025",
    data: { bikeLaps: 2 },
    exact: false,
  });
});

test("buildLegDetails omits unknown values rather than inferring them", () => {
  assert.deepEqual(buildLegDetails(
    { swimType: "Bay", bikeTerrain: "Flat" },
    { swimLaps: 1, bikeElevationGainFt: 756 }
  ), [
    { label: "Swim", primary: "Bay", details: ["1 lap"] },
    { label: "Bike", primary: "Flat", details: ["756 ft gain"] },
  ]);
});

test("temperature labels are explicitly typical conditions", () => {
  assert.deepEqual(buildConditions({
    typicalHighAirF: 76,
    typicalLowAirF: 56,
    typicalWaterF: 76,
  }), [
    "Typical high 76°F",
    "Typical low 56°F",
    "Typical water 76°F",
  ]);
});

test("observed signals are capped and prioritize transitions", () => {
  const labels = formatObservationSignals({
    signals: [
      { split: "run", direction: "slow", percentile: 95 },
      { split: "t1", direction: "slow", percentile: 95 },
      { split: "swim", direction: "fast", percentile: 5 },
      { split: "bike", direction: "slow", percentile: 95 },
    ],
  }, 3);

  assert.deepEqual(labels, [
    "T1 median is among the slowest 5% of race-years",
    "Swim median is among the fastest 5% of race-years",
    "Bike median is among the slowest 5% of race-years",
  ]);
});
