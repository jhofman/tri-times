/**
 * Refresh typical air/water temperatures in results/course-metadata.json
 * from each race's official Ironman race page.
 *
 * Only temperature fields are updated; curated swim/bike/run descriptions are
 * left alone, but mismatches with the race page are reported for review.
 *
 * Usage: node scripts/fetch-course-conditions.js
 */

const fs = require("fs");
const path = require("path");

const METADATA_PATH = path.join(__dirname, "..", "results", "course-metadata.json");

function pageText(html) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

function parseConditions(text) {
  const temp = label => {
    const match = text.match(new RegExp(`${label}\\s+(\\d+)\\s*°\\s*F`, "i"));
    return match ? Number(match[1]) : null;
  };
  const terrain = leg => {
    const match = text.match(new RegExp(`\\b${leg}\\s+([A-Z][a-z]+(?: [a-z]+)?)\\s+—`));
    return match ? match[1] : null;
  };
  return {
    typicalHighAirF: temp("High Air Temp"),
    typicalLowAirF: temp("Low Air Temp"),
    typicalWaterF: temp("Avg\\.? Water Temp"),
    swimType: terrain("Swim"),
    bikeTerrain: terrain("Bike"),
    runTerrain: terrain("Run"),
  };
}

async function main() {
  const metadata = JSON.parse(fs.readFileSync(METADATA_PATH, "utf8"));
  for (const [race, entry] of Object.entries(metadata.races)) {
    if (!entry.officialPage) continue;
    const response = await fetch(entry.officialPage, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!response.ok) {
      console.warn(`${race}: HTTP ${response.status}`);
      continue;
    }
    const found = parseConditions(pageText(await response.text()));
    const profile = entry.profile || (entry.profile = {});
    for (const key of ["typicalHighAirF", "typicalLowAirF", "typicalWaterF"]) {
      if (found[key] != null) profile[key] = found[key];
    }
    const mismatches = ["swimType", "bikeTerrain", "runTerrain"]
      .filter(key => found[key] && profile[key] && found[key] !== profile[key])
      .map(key => `${key}: curated "${profile[key]}" vs page "${found[key]}"`);
    console.log(
      `${race}: air ${profile.typicalLowAirF ?? "?"}–${profile.typicalHighAirF ?? "?"}°F, water ${profile.typicalWaterF ?? "?"}°F` +
      (mismatches.length ? `\n  note ${mismatches.join("; ")}` : "")
    );
  }
  metadata.retrievedAt = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(METADATA_PATH, JSON.stringify(metadata, null, 2) + "\n");
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { parseConditions, pageText };
