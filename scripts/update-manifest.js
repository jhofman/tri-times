/**
 * Update Manifest Script
 *
 * Scans the results/ directory for CSV files and regenerates results/races.json.
 * CSV files should follow the naming convention: {racename}_{year}.csv
 *
 * Usage: node scripts/update-manifest.js
 */

const fs = require("fs");
const path = require("path");

const RESULTS_DIR = path.join(__dirname, "..", "results");
const MANIFEST_PATH = path.join(RESULTS_DIR, "races.json");

// Map race IDs to display names (add new races here)
const RACE_NAMES = {
  northcarolina: "North Carolina",
  jonesbeach: "Jones Beach",
  westernmass: "Western Mass",
  chattanooga: "Chattanooga",
  texas: "Texas",
  florida: "Florida",
  california: "California",
  arizona: "Arizona",
  // Add more races as needed
};

function updateManifest() {
  const files = fs.readdirSync(RESULTS_DIR);
  const races = {};

  // Parse CSV filenames
  for (const file of files) {
    if (!file.endsWith(".csv")) continue;

    const match = file.match(/^([a-z]+)_(\d{4})\.csv$/);
    if (!match) {
      console.warn(`Skipping unrecognized file: ${file}`);
      continue;
    }

    const [, raceId, year] = match;

    if (!races[raceId]) {
      races[raceId] = {
        name: RACE_NAMES[raceId] || raceId,
        years: [],
      };
    }

    if (!races[raceId].years.includes(year)) {
      races[raceId].years.push(year);
    }
  }

  // Sort years descending for each race
  for (const raceId of Object.keys(races)) {
    races[raceId].years.sort((a, b) => parseInt(b) - parseInt(a));
  }

  // Write manifest
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(races, null, 2) + "\n");
  console.log(`Updated ${MANIFEST_PATH}`);

  // Print summary
  for (const [raceId, race] of Object.entries(races)) {
    console.log(`  ${race.name}: ${race.years.join(", ")}`);
  }
}

updateManifest();
