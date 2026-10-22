const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const metadata = JSON.parse(
  fs.readFileSync(path.join(ROOT, "results", "course-metadata.json"), "utf8")
);
const races = JSON.parse(
  fs.readFileSync(path.join(ROOT, "results", "races.json"), "utf8")
);

test("course metadata references known races and valid edition sources", () => {
  assert.equal(metadata.schemaVersion, 1);
  assert.match(metadata.retrievedAt, /^\d{4}-\d{2}-\d{2}$/);

  for (const [raceId, race] of Object.entries(metadata.races)) {
    assert.ok(races[raceId], `Unknown race ID: ${raceId}`);
    assert.match(race.officialPage, /^https:\/\/www\.ironman\.com\//);

    for (const [year, edition] of Object.entries(race.editions || {})) {
      assert.match(year, /^\d{4}$/);
      assert.ok(
        race.sources?.[edition.source],
        `${raceId} ${year} references missing source ${edition.source}`
      );
    }
  }
});

test("course metadata preserves missing values instead of placeholder strings", () => {
  const serialized = JSON.stringify(metadata);
  assert.doesNotMatch(serialized, /"unknown"/i);
  assert.doesNotMatch(serialized, /"n\/a"/i);
});
