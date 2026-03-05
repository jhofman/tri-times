/**
 * Update Manifest Script
 *
 * Scans the results/ directory for CSV files and regenerates:
 *   - results/races.json  (race manifest)
 *   - results/race-stats.json  (pre-computed decile stats per race)
 *
 * CSV files should follow the naming convention: {race-name}_{year}.csv
 *
 * Usage: node scripts/update-manifest.js
 */

const fs = require("fs");
const path = require("path");

const RESULTS_DIR = path.join(__dirname, "..", "results");
const MANIFEST_PATH = path.join(RESULTS_DIR, "races.json");
const STATS_PATH = path.join(RESULTS_DIR, "race-stats.json");

const SPLITS = ["swim", "t1", "bike", "t2", "run", "finish"];
const SPLIT_COLUMNS = {
  swim: "Swim (Seconds)",
  t1: "T1 (Seconds)",
  bike: "Bike (Seconds)",
  t2: "T2 (Seconds)",
  run: "Run (Seconds)",
  finish: "Finish (Seconds)",
};
const DECILES = [10, 20, 30, 40, 50, 60, 70, 80, 90];

/**
 * Convert hyphenated race ID to display name.
 * e.g., "north-carolina" → "North Carolina"
 */
function toDisplayName(raceId) {
  return raceId
    .split("-")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** Simple CSV parser for our known format (quoted fields, no embedded newlines). */
function parseCsv(text) {
  const lines = text.split("\n").filter(l => l.trim());
  if (lines.length === 0) return [];

  const headers = parseCsvLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] || "";
    }
    rows.push(row);
  }
  return rows;
}

function parseCsvLine(line) {
  const fields = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

/** Compute a percentile value from a sorted array. */
function percentile(sorted, pct) {
  if (sorted.length === 0) return 0;
  const idx = Math.floor(sorted.length * pct / 100);
  return sorted[Math.min(idx, sorted.length - 1)];
}

/** Compute decile stats for a single year's data. Returns { "10": { swim: ..., ... }, ... } */
function computeYearDeciles(rows) {
  // Filter to finishers (finish > 0)
  const finishers = rows.filter(r => {
    const v = parseFloat(r[SPLIT_COLUMNS.finish]);
    return v > 0;
  });

  if (finishers.length === 0) return null;

  // Build sorted arrays per split
  const sorted = {};
  for (const split of SPLITS) {
    sorted[split] = finishers
      .map(r => parseFloat(r[SPLIT_COLUMNS[split]]))
      .filter(v => v > 0)
      .sort((a, b) => a - b);
  }

  const deciles = {};
  for (const d of DECILES) {
    deciles[d] = {};
    for (const split of SPLITS) {
      deciles[d][split] = sorted[split].length > 0 ? percentile(sorted[split], d) : 0;
    }
  }

  return { deciles, athleteCount: finishers.length };
}

/** Median of an array of numbers. */
function median(arr) {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function updateManifest() {
  const files = fs.readdirSync(RESULTS_DIR);
  const races = {};
  const raceFiles = {}; // raceId -> [{ year, file }]

  // Parse CSV filenames (allows hyphens in race name)
  for (const file of files) {
    if (!file.endsWith(".csv")) continue;

    const match = file.match(/^([a-z-]+)_(\d{4})\.csv$/);
    if (!match) {
      console.warn(`Skipping unrecognized file: ${file}`);
      continue;
    }

    const [, raceId, year] = match;

    if (!races[raceId]) {
      races[raceId] = {
        name: toDisplayName(raceId),
        years: [],
      };
      raceFiles[raceId] = [];
    }

    if (!races[raceId].years.includes(year)) {
      races[raceId].years.push(year);
      raceFiles[raceId].push({ year, file });
    }
  }

  // Sort years descending for each race
  for (const raceId of Object.keys(races)) {
    races[raceId].years.sort((a, b) => parseInt(b) - parseInt(a));
  }

  // Write manifest
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(races, null, 2) + "\n");
  console.log(`Updated ${MANIFEST_PATH}`);

  // Compute race stats
  console.log("\nComputing race stats...");
  const raceStats = {};

  for (const [raceId, race] of Object.entries(races)) {
    const yearResults = [];
    let totalAthletes = 0;

    for (const { file } of raceFiles[raceId]) {
      const csv = fs.readFileSync(path.join(RESULTS_DIR, file), "utf-8");
      const rows = parseCsv(csv);
      const result = computeYearDeciles(rows);
      if (result) {
        yearResults.push(result.deciles);
        totalAthletes += result.athleteCount;
      }
    }

    if (yearResults.length === 0) continue;

    // Median-of-medians: for each decile/split, take the median across years
    const aggregated = {};
    for (const d of DECILES) {
      aggregated[d] = {};
      for (const split of SPLITS) {
        const values = yearResults.map(yr => yr[d][split]).filter(v => v > 0);
        aggregated[d][split] = Math.round(median(values));
      }
    }

    raceStats[raceId] = {
      name: race.name,
      yearCount: yearResults.length,
      totalAthletes,
      deciles: aggregated,
    };
  }

  fs.writeFileSync(STATS_PATH, JSON.stringify(raceStats, null, 2) + "\n");
  console.log(`Updated ${STATS_PATH}`);

  // Print summary
  const raceCount = Object.keys(raceStats).length;
  const totalAth = Object.values(raceStats).reduce((s, r) => s + r.totalAthletes, 0);
  console.log(`  ${raceCount} races, ${totalAth.toLocaleString()} total athletes`);
}

updateManifest();
