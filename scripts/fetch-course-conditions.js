/**
 * Refresh the official race-page profile in results/course-metadata.json:
 * swim/bike/run labels and typical air/water temperatures.
 *
 * Venue-specific detail (e.g. "Saltwater harbor swim") lives in edition
 * features, so the headline labels stay on Ironman's consistent scale.
 *
 * Races without metadata are discovered by trying their im703-<id> race
 * page; retired races (no page, or a redirect elsewhere) and World
 * Championships (rotating venues) are skipped.
 *
 * Usage: node scripts/fetch-course-conditions.js
 */

const fs = require("fs");
const path = require("path");

const METADATA_PATH = path.join(__dirname, "..", "results", "course-metadata.json");
const RACES_PATH = path.join(__dirname, "..", "results", "races.json");
const RACE_PAGE_ALIASES = { "aracaju-sergipe": "sergipe" };
// World Championship results span rotating venues, so no single page describes them.
const ROTATING_VENUE = /^world-championship/;

function racePageUrl(race) {
  return `https://www.ironman.com/races/im703-${RACE_PAGE_ALIASES[race] || race}`;
}

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
  const races = JSON.parse(fs.readFileSync(RACES_PATH, "utf8"));
  for (const race of Object.keys(races).sort()) {
    if (ROTATING_VENUE.test(race)) continue;
    const existing = metadata.races[race];
    const url = existing?.officialPage || racePageUrl(race);
    const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    const redirected = new URL(response.url).pathname !== new URL(url).pathname;
    if (!response.ok || redirected) {
      if (existing) console.warn(`${race}: ${redirected ? `redirected to ${response.url}` : `HTTP ${response.status}`}`);
      continue;
    }
    const found = parseConditions(pageText(await response.text()));
    if (!existing && Object.values(found).every(value => value == null)) continue;

    const entry = existing || (metadata.races[race] = { profile: {}, officialPage: url });
    const profile = entry.profile || (entry.profile = {});
    const changes = [];
    for (const [key, value] of Object.entries(found)) {
      if (value == null || profile[key] === value) continue;
      changes.push(`${key} ${profile[key] ?? "–"} → ${value}`);
      profile[key] = value;
    }
    console.log(`${race}: ${existing ? "" : "added; "}${changes.length ? changes.join(", ") : "unchanged"}`);
  }
  metadata.races = Object.fromEntries(Object.entries(metadata.races).sort(([a], [b]) => a.localeCompare(b)));
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
