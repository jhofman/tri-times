/**
 * Refresh the official race-page profile in results/course-metadata.json:
 * swim/bike/run labels and typical air/water temperatures.
 *
 * Venue-specific detail (e.g. "Saltwater harbor swim") lives in edition
 * features, so the headline labels stay on Ironman's consistent scale.
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
    const changes = [];
    for (const [key, value] of Object.entries(found)) {
      if (value == null || profile[key] === value) continue;
      changes.push(`${key} ${profile[key] ?? "–"} → ${value}`);
      profile[key] = value;
    }
    console.log(`${race}: ${changes.length ? changes.join(", ") : "unchanged"}`);
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
