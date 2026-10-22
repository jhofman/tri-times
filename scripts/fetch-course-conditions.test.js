const test = require("node:test");
const assert = require("node:assert/strict");

const { pageText, parseConditions } = require("./fetch-course-conditions");

test("parses temperatures and terrain from an official race page", () => {
  const html = `<div>Swim</div><div>Bay</div> — <div>Bike</div><div>Flat</div> — <div>Run</div><div>Rolling</div> —
    <div>High Air Temp</div><div>73 &nbsp;°F / 23 °C</div> — <div>Low Air Temp</div><div>53 °F / 12 °C</div> —
    <div>Avg. Water Temp</div><div>72 °F / 22 °C</div>`;
  assert.deepEqual(parseConditions(pageText(html)), {
    typicalHighAirF: 73,
    typicalLowAirF: 53,
    typicalWaterF: 72,
    swimType: "Bay",
    bikeTerrain: "Flat",
    runTerrain: "Rolling",
  });
});

test("missing temperatures stay null rather than being inferred", () => {
  assert.equal(parseConditions("Swim Lake — Bike Hilly —").typicalWaterF, null);
});
