/**
 * Update Manifest Script
 *
 * Scans the results/ directory for CSV files and regenerates:
 *   - results/races.json  (race manifest)
 *   - results/race-stats.json  (pre-computed decile stats per race)
 *   - results/athletes/*.json  (athlete index sharded by first letter)
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
const ATHLETES_DIR = path.join(RESULTS_DIR, "athletes");

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
const PERCENTILES = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95];

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

/** Compute percentile stats for a single year's data. Returns { "5": { swim: ..., ... }, "10": {...}, ... } */
function computeYearPercentiles(rows) {
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

  const pctiles = {};
  for (const p of PERCENTILES) {
    pctiles[p] = {};
    for (const split of SPLITS) {
      pctiles[p][split] = sorted[split].length > 0 ? percentile(sorted[split], p) : 0;
    }
  }

  return { pctiles, athleteCount: finishers.length };
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
      const result = computeYearPercentiles(rows);
      if (result) {
        yearResults.push(result.pctiles);
        totalAthletes += result.athleteCount;
      }
    }

    if (yearResults.length === 0) continue;

    // Median-of-medians: for each percentile/split, take the median across years
    const aggregated = {};
    for (const p of PERCENTILES) {
      aggregated[p] = {};
      for (const split of SPLITS) {
        const values = yearResults.map(yr => yr[p][split]).filter(v => v > 0);
        aggregated[p][split] = Math.round(median(values));
      }
    }

    raceStats[raceId] = {
      name: race.name,
      yearCount: yearResults.length,
      totalAthletes,
      percentiles: aggregated,
    };
  }

  fs.writeFileSync(STATS_PATH, JSON.stringify(raceStats, null, 2) + "\n");
  console.log(`Updated ${STATS_PATH}`);

  // Print summary
  const raceCount = Object.keys(raceStats).length;
  const totalAth = Object.values(raceStats).reduce((s, r) => s + r.totalAthletes, 0);
  console.log(`  ${raceCount} races, ${totalAth.toLocaleString()} total athletes`);

  // Build athlete index sharded by first letter of name
  console.log("\nBuilding athlete index...");
  const athleteShards = {};

  for (const { file } of Object.values(raceFiles).flat()) {
    const match = file.match(/^([a-z-]+)_(\d{4})\.csv$/);
    if (!match) continue;
    const [, raceId, year] = match;

    const csv = fs.readFileSync(path.join(RESULTS_DIR, file), "utf-8");
    const rows = parseCsv(csv);

    // First pass: build sorted arrays per split for percentile computation
    const splitArrays = { swim: [], t1: [], bike: [], t2: [], run: [], finish: [] };
    const finishers = [];
    for (const row of rows) {
      const name = (row["Athlete Name"] || "").replace(/"/g, "").trim();
      if (!name) continue;
      const f = parseFloat(row[SPLIT_COLUMNS.finish]) || 0;
      if (f <= 0) continue;
      finishers.push(row);
      for (const sp of ["swim", "t1", "bike", "t2", "run", "finish"]) {
        const v = parseFloat(row[SPLIT_COLUMNS[sp]]) || 0;
        if (v > 0) splitArrays[sp].push(v);
      }
    }
    for (const sp of ["swim", "t1", "bike", "t2", "run", "finish"]) {
      splitArrays[sp].sort((a, b) => a - b);
    }

    // Helper: percentile rank matching app.js formula
    function pctRank(sorted, value) {
      if (value <= 0 || sorted.length === 0) return 0;
      let count = 0;
      for (let i = 0; i < sorted.length; i++) {
        if (sorted[i] <= value) count++;
        else break;
      }
      return Math.round((count / sorted.length) * 100);
    }

    // Second pass: build shard entries with percentiles
    for (const row of finishers) {
      const name = (row["Athlete Name"] || "").replace(/"/g, "").trim();
      const letter = name[0].toLowerCase();
      if (!athleteShards[letter]) athleteShards[letter] = {};
      if (!athleteShards[letter][name]) athleteShards[letter][name] = [];

      const swim = parseInt(parseFloat(row[SPLIT_COLUMNS.swim]) || 0);
      const t1 = parseInt(parseFloat(row[SPLIT_COLUMNS.t1]) || 0);
      const bike = parseInt(parseFloat(row[SPLIT_COLUMNS.bike]) || 0);
      const t2 = parseInt(parseFloat(row[SPLIT_COLUMNS.t2]) || 0);
      const run = parseInt(parseFloat(row[SPLIT_COLUMNS.run]) || 0);
      const finish = parseInt(parseFloat(row[SPLIT_COLUMNS.finish]) || 0);

      athleteShards[letter][name].push([
        raceId, year, swim, t1, bike, t2, run, finish,
        (row["Division"] || "").replace(/"/g, ""),
        pctRank(splitArrays.swim, swim),
        pctRank(splitArrays.t1, t1),
        pctRank(splitArrays.bike, bike),
        pctRank(splitArrays.t2, t2),
        pctRank(splitArrays.run, run),
        pctRank(splitArrays.finish, finish),
      ]);
    }
  }

  // Sort each athlete's races by year descending
  for (const shard of Object.values(athleteShards)) {
    for (const races of Object.values(shard)) {
      races.sort((a, b) => b[1].localeCompare(a[1]));
    }
  }

  // Write shards
  if (!fs.existsSync(ATHLETES_DIR)) fs.mkdirSync(ATHLETES_DIR);
  let totalAthletes = 0;
  for (const [letter, data] of Object.entries(athleteShards)) {
    const filePath = path.join(ATHLETES_DIR, `${letter}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data));
    totalAthletes += Object.keys(data).length;
  }
  console.log(`Updated ${ATHLETES_DIR}/`);
  console.log(`  ${Object.keys(athleteShards).length} shards, ${totalAthletes.toLocaleString()} athletes`);
}

updateManifest();
