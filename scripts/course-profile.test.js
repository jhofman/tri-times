const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildConditions,
  buildFeatures,
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
    signals: [
      { split: "run", direction: "slow", percentile: 95 },
      { split: "t1", direction: "slow", percentile: 99 },
      { split: "swim", direction: "fast", percentile: 5 },
      { split: "bike", direction: "slow", percentile: 95 },
    ],
  }, 3);

  assert.deepEqual(chips.map(chip => [chip.text, chip.icon]), [
    ["Very long T1", "hourglass-half"],
    ["Fast swim", "bolt"],
    ["Slow bike", "hourglass-half"],
  ]);
  assert.match(chips[0].title, /slowest 1% of race-years.*unadjusted for field strength/);
});
