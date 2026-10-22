const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildConditions,
  buildFeatures,
  buildLegDetails,
  formatObservationSignals,
  formatYearSignals,
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
    {
      label: "Swim", icon: "person-swimming", primary: "Bay", primaryIcon: "water",
      details: [{ text: "1 lap", icon: "rotate" }],
    },
    {
      label: "Bike", icon: "person-biking", primary: "Flat", primaryIcon: "minus",
      details: [{ text: "756 ft gain", icon: "arrow-trend-up" }],
    },
  ]);
});

test("feature icons match keywords and fall back to an info icon", () => {
  assert.deepEqual(buildFeatures([
    "Separate T1 and T2 locations",
    "Current-assisted downriver swim",
    "Scenic finish",
  ]).map(feature => feature.icon), ["location-dot", "forward", "circle-info"]);
});

test("typical temperatures fold into an air range and the swim leg", () => {
  const profile = { swimType: "Lake", typicalHighAirF: 76, typicalLowAirF: 56, typicalWaterF: 76 };
  assert.equal(buildConditions(profile).text, "Air 56–76°F");
  assert.equal(buildConditions({ typicalHighAirF: 80 }).text, "Air high 80°F");
  assert.equal(buildConditions({}), null);
  assert.deepEqual(buildLegDetails(profile, null)[0].details.map(detail => detail.text), ["76°F water"]);
});

test("observed signals are capped, prioritize transitions, and become short chips", () => {
  const chips = formatObservationSignals({
    years: 8,
    signals: [
      { split: "run", direction: "slow", percentile: 95 },
      { split: "t1", direction: "slow", percentile: 99 },
      { split: "swim", direction: "fast", percentile: 5 },
      { split: "bike", direction: "slow", percentile: 95 },
    ],
  }, 3);

  assert.deepEqual(chips.map(chip => [chip.text, chip.icon]), [
    ["Very long T1 setup", "hourglass-half"],
    ["Fast swim course", "bolt"],
    ["Slow bike course", "hourglass-half"],
  ]);
  assert.match(chips[0].title, /Typical T1 median across 8 years is among the slowest 1% of 70.3 races.*unadjusted for field strength/);
});

test("year chips name the year and size the gap", () => {
  const observation = {
    yearSignals: [
      { split: "run", deltaSeconds: -470, typicalSeconds: 7492, otherYears: 3 },
      { split: "t2", deltaSeconds: 69, typicalSeconds: 302, otherYears: 8 },
      { split: "swim", deltaSeconds: -1592, typicalSeconds: 2649, otherYears: 2, likelyShortened: true },
    ],
  };
  assert.deepEqual(formatYearSignals(observation, "2023", "New York").map(chip => [chip.text, chip.icon]), [
    ["2023 swim much faster than usual", "triangle-exclamation"],
    ["2023 T2 69 sec longer than usual", "arrow-up"],
    ["2023 run 8 min faster than usual", "arrow-down"],
  ]);
  assert.match(formatYearSignals(observation, "2023", "New York")[2].title, /2:04:52 typical across 3 other New York years/);
});
