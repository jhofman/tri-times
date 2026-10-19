const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getYearFromName,
  parseArguments,
  validateHistoricalRegistry,
  validateHistoricalResults,
  validateOptionsForMode,
} = require("./scraper");

const EVENT_ID = "265D1956-55C5-460C-B786-CB365140FB7A";

test("validates and flattens a historical registry", () => {
  const records = validateHistoricalRegistry({
    version: 1,
    races: [{
      id: "atlantic-city",
      name: "Atlantic City",
      events: [{ year: "2021", eventId: EVENT_ID }],
    }],
  });

  assert.deepEqual(records, [{
    raceId: "atlantic-city",
    raceName: "Atlantic City",
    year: "2021",
    eventId: EVENT_ID,
  }]);
});

test("rejects duplicate historical race years", () => {
  assert.throws(() => validateHistoricalRegistry({
    version: 1,
    races: [{
      id: "atlantic-city",
      events: [
        { year: "2021", eventId: EVENT_ID },
        { year: "2021", eventId: "C5A9C592-7CED-4D22-B454-6D2DA6DE4684" },
      ],
    }],
  }), /Duplicate historical race year/);
});

test("validates historical API result identity", () => {
  const record = {
    raceId: "atlantic-city",
    year: "2021",
    eventId: EVENT_ID,
  };
  validateHistoricalResults([{
    _wtc_eventid_value: EVENT_ID.toLowerCase(),
    wtc_EventId: { wtc_name: "2021 IRONMAN 70.3 Atlantic City" },
  }], record);

  assert.throws(() => validateHistoricalResults([{
    _wtc_eventid_value: EVENT_ID,
    wtc_EventId: { wtc_name: "2022 IRONMAN 70.3 Atlantic City" },
  }], record), /Event year mismatch/);
});

test("allows missing-only without a year for historical registries", () => {
  const { input, options } = parseArguments([
    "historical-races.json",
    "--missing-only",
  ]);
  assert.equal(input, "historical-races.json");
  assert.equal(options.missingOnly, true);
  assert.doesNotThrow(() => validateOptionsForMode(input, options));
});

test("keeps active-race missing-only behavior scoped to a year", () => {
  const { input, options } = parseArguments(["races.txt", "--missing-only"]);
  assert.throws(
    () => validateOptionsForMode(input, options),
    /require --year/
  );
});

test("extracts event years from names", () => {
  assert.equal(getYearFromName("2023 IRONMAN 70.3 Atlantic City"), "2023");
  assert.equal(getYearFromName("IRONMAN 70.3 Atlantic City"), null);
});
