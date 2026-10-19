/**
 * Ironman Results Scraper
 *
 * Original source: https://github.com/colinlord/ironman-results
 * Author: Colin Lord
 *
 * This script fetches race results from the Ironman API and saves them as CSV files.
 *
 * Usage:
 *   node scripts/scraper.js <url>           # Scrape a single race
 *   node scripts/scraper.js races.txt       # Scrape all races in file
 *   node scripts/scraper.js                 # Interactive mode
 *
 * Race name is auto-derived from URL (im703-north-carolina → northcarolina)
 */

const fs = require("fs/promises");
const fsSync = require("fs");
const path = require("path");
const readline = require("readline");

const USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const DELAY_BETWEEN_RACES = 5000; // 5 seconds between races when batch processing
const RESULTS_DIR = process.env.RESULTS_DIR
  ? path.resolve(process.env.RESULTS_DIR)
  : path.join(__dirname, "..", "results");
const HISTORICAL_REGISTRY_VERSION = 1;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class HttpError extends Error {
  constructor(status, url) {
    super(`HTTP ${status} fetching ${url}`);
    this.status = status;
  }
}

async function fetchWithRetry(url, options = {}) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    let retryDelayMs = attempt * 5000;
    try {
      const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(30000),
      });

      if (response.ok) return response;
      if (response.status === 404) {
        throw new HttpError(response.status, url);
      }
      if (response.status === 403) {
        retryDelayMs = attempt * 10000;
      } else if (response.status === 429) {
        const retryAfter = Number(response.headers.get("retry-after"));
        retryDelayMs = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : attempt * 30000;
      } else if (response.status < 500) {
        throw new HttpError(response.status, url);
      }
      if (attempt === 3) throw new HttpError(response.status, url);
      console.log(`HTTP ${response.status}; retrying in ${retryDelayMs / 1000}s...`);
    } catch (error) {
      if (error instanceof HttpError || attempt === 3) throw error;
      console.log(`${error.message}; retrying in ${retryDelayMs / 1000}s...`);
    }

    await new Promise(resolve => setTimeout(resolve, retryDelayMs));
  }
}

function isUnavailableResultsError(error) {
  return error.code === "RESULTS_UNAVAILABLE" ||
    (error instanceof HttpError && (error.status === 403 || error.status === 404));
}

/**
 * Extract race name from URL (im703-north-carolina → north-carolina)
 */
function extractRaceName(url) {
  const match = url.match(/im703-([^/]+)/);
  if (!match) return null;
  return match[1];
}

/**
 * Resolves a URL to the labs-v2.competitor.com results URL.
 */
async function resolveResultsUrl(url) {
  if (url.includes("labs-v2.competitor.com")) {
    return url;
  }

  // Add /results if needed
  if (url.match(/ironman\.com\/races\/[^/]+\/?$/) && !url.endsWith("/results")) {
    url = url.replace(/\/?$/, "/results");
  }

  const response = await fetchWithRetry(url, {
    headers: { "User-Agent": USER_AGENT },
  });

  const html = await response.text();
  const iframeMatch = html.match(/src=["'](https:\/\/labs-v2\.competitor\.com\/results\/event\/[^"']+)["']/);

  if (!iframeMatch) {
    const error = new Error("Could not find results iframe on this page.");
    error.code = "RESULTS_UNAVAILABLE";
    throw error;
  }

  return iframeMatch[1];
}

/**
 * Fetches the __NEXT_DATA__ blob from a page.
 */
async function fetchNextData(url) {
  const response = await fetchWithRetry(url, {
    headers: { "User-Agent": USER_AGENT },
  });

  const htmlContent = await response.text();
  const match = htmlContent.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s);

  if (!match || !match[1]) {
    throw new Error("Could not find __NEXT_DATA__ script tag.");
  }

  return JSON.parse(match[1]);
}

/**
 * Fetches the results JSON for a specific event UUID.
 */
async function fetchResultsForEvent(eventUuid) {
  const response = await fetchWithRetry(`https://labs-v2.competitor.com/api/results?wtc_eventid=${eventUuid}`, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
  });

  const data = await response.json();

  if (data?.resultsJson?.value) {
    return data.resultsJson.value;
  }

  throw new Error('API response did not contain "resultsJson.value".');
}

/**
 * Converts results array to CSV string.
 */
function convertToCSV(data) {
  const headers = [
    "Bib Number", "Athlete Name", "Gender", "City", "State", "Country", "Division", "Status",
    "Finish Time", "Swim Time", "T1 Time", "Bike Time", "T2 Time", "Run Time",
    "Overall Rank", "Gender Rank", "Division Rank", "AWA Points",
    "Swim Rank (Overall)", "Swim Rank (Gender)", "Swim Rank (Division)",
    "Bike Rank (Overall)", "Bike Rank (Gender)", "Bike Rank (Division)",
    "Run Rank (Overall)", "Run Rank (Gender)", "Run Rank (Division)",
    "Finish (Seconds)", "Swim (Seconds)", "T1 (Seconds)", "Bike (Seconds)", "T2 (Seconds)", "Run (Seconds)",
  ];

  const rows = data.map((r) => ({
    "Bib Number": r.bib,
    "Athlete Name": r.athlete,
    Gender: r.wtc_ContactId?.gendercode_formatted || "",
    City: r.wtc_ContactId?.address1_city || "",
    State: r.wtc_ContactId?.address1_stateorprovince || "",
    Country: r.countryiso2,
    Division: r.wtc_AgeGroupId?.wtc_agegroupname || r.wtc_DivisionId?.wtc_name || "",
    Status: r.wtc_dnf ? "DNF" : r.wtc_dq ? "DQ" : "FIN",
    "Finish Time": r.wtc_finishtimeformatted,
    "Swim Time": r.wtc_swimtimeformatted,
    "T1 Time": r.wtc_transition1timeformatted,
    "Bike Time": r.wtc_biketimeformatted,
    "T2 Time": r.wtc_transitiontime2formatted,
    "Run Time": r.wtc_runtimeformatted,
    "Overall Rank": r.wtc_finishrankoverall,
    "Gender Rank": r.wtc_finishrankgender,
    "Division Rank": r.wtc_finishrankgroup,
    "AWA Points": r.wtc_points,
    "Swim Rank (Overall)": r.wtc_swimrankoverall,
    "Swim Rank (Gender)": r.wtc_swimrankgender,
    "Swim Rank (Division)": r.wtc_swimrankgroup,
    "Bike Rank (Overall)": r.wtc_bikerankoverall,
    "Bike Rank (Gender)": r.wtc_bikerankgender,
    "Bike Rank (Division)": r.wtc_bikerankgroup,
    "Run Rank (Overall)": r.wtc_runrankoverall,
    "Run Rank (Gender)": r.wtc_runrankgender,
    "Run Rank (Division)": r.wtc_runrankgroup,
    "Finish (Seconds)": r.wtc_finishtime,
    "Swim (Seconds)": r.wtc_swimtime,
    "T1 (Seconds)": r.wtc_transition1time,
    "Bike (Seconds)": r.wtc_biketime,
    "T2 (Seconds)": r.wtc_transition2time,
    "Run (Seconds)": r.wtc_runtime,
  }));

  const headerRow = headers.join(",");
  const dataRows = rows.map((row) =>
    headers.map((h) => `"${String(row[h] || "").replace(/"/g, '""')}"`).join(",")
  );

  return [headerRow, ...dataRows].join("\n");
}

/**
 * Extract year from event name.
 */
function getYearFromName(eventName) {
  if (!eventName) return null;
  const match = eventName.match(/\b(20\d{2})\b/);
  return match ? match[1] : null;
}

function validateHistoricalRegistry(registry) {
  if (!registry || registry.version !== HISTORICAL_REGISTRY_VERSION) {
    throw new Error(`Historical registry must have version ${HISTORICAL_REGISTRY_VERSION}`);
  }
  if (!Array.isArray(registry.races) || registry.races.length === 0) {
    throw new Error("Historical registry must contain at least one race");
  }

  const records = [];
  const raceYears = new Set();
  const eventIds = new Set();

  for (const race of registry.races) {
    if (!race || !/^[a-z0-9-]+$/.test(race.id || "")) {
      throw new Error(`Invalid historical race id: ${race?.id || "(missing)"}`);
    }
    if (!Array.isArray(race.events) || race.events.length === 0) {
      throw new Error(`Historical race ${race.id} must contain at least one event`);
    }

    for (const event of race.events) {
      const year = String(event?.year || "");
      const eventId = String(event?.eventId || "");
      if (!/^20\d{2}$/.test(year)) {
        throw new Error(`Invalid year for ${race.id}: ${year || "(missing)"}`);
      }
      if (!UUID_PATTERN.test(eventId)) {
        throw new Error(`Invalid event UUID for ${race.id} ${year}: ${eventId || "(missing)"}`);
      }

      const raceYear = `${race.id}:${year}`;
      const normalizedEventId = eventId.toLowerCase();
      if (raceYears.has(raceYear)) {
        throw new Error(`Duplicate historical race year: ${race.id} ${year}`);
      }
      if (eventIds.has(normalizedEventId)) {
        throw new Error(`Duplicate historical event UUID: ${eventId}`);
      }

      raceYears.add(raceYear);
      eventIds.add(normalizedEventId);
      records.push({
        raceId: race.id,
        raceName: race.name || race.id,
        year,
        eventId,
      });
    }
  }

  return records.sort((a, b) =>
    a.raceId.localeCompare(b.raceId) || a.year.localeCompare(b.year)
  );
}

function validateHistoricalResults(resultsData, record) {
  if (!Array.isArray(resultsData) || resultsData.length === 0) {
    throw new Error(`No results found for ${record.raceId} ${record.year}`);
  }

  const expectedEventId = record.eventId.toLowerCase();
  const resultEventIds = new Set(
    resultsData
      .map(result => result._wtc_eventid_value)
      .filter(Boolean)
      .map(eventId => eventId.toLowerCase())
  );
  if (resultEventIds.size > 0 &&
      (resultEventIds.size !== 1 || !resultEventIds.has(expectedEventId))) {
    throw new Error(`Event UUID mismatch for ${record.raceId} ${record.year}`);
  }

  const resultYears = new Set(
    resultsData
      .map(result => getYearFromName(result.wtc_EventId?.wtc_name))
      .filter(Boolean)
  );
  if (resultYears.size > 0 &&
      (resultYears.size !== 1 || !resultYears.has(record.year))) {
    throw new Error(`Event year mismatch for ${record.raceId} ${record.year}`);
  }
}

async function importHistoricalEvent(record, options = {}) {
  const outputFile = path.join(RESULTS_DIR, `${record.raceId}_${record.year}.csv`);
  if (options.missingOnly && fsSync.existsSync(outputFile)) {
    console.log(`${record.raceId} ${record.year}: Already exists; skipping.`);
    return { existing: true };
  }

  console.log(`\n=== Importing ${record.raceName} ${record.year} ===`);
  console.log(`Event UUID: ${record.eventId}`);

  const resultsData = await fetchResultsForEvent(record.eventId);
  validateHistoricalResults(resultsData, record);

  const tempFile = `${outputFile}.tmp`;
  try {
    await fs.writeFile(tempFile, convertToCSV(resultsData));
    await fs.rename(tempFile, outputFile);
  } catch (error) {
    await fs.rm(tempFile, { force: true });
    throw error;
  }

  console.log(`Saved ${resultsData.length} results to ${outputFile}.`);
  return { imported: true, athleteCount: resultsData.length };
}

/**
 * Scrape a single race URL.
 */
async function scrapeRace(inputUrl, raceName, options = {}) {
  const {
    targetYear = null,
    missingOnly = false,
    newRacesOnly = false,
  } = options;
  console.log(`\n=== Scraping ${raceName} ===`);
  console.log(`URL: ${inputUrl}`);

  if (newRacesOnly) {
    const hasExistingData = fsSync.readdirSync(RESULTS_DIR)
      .some(file => file.startsWith(`${raceName}_`) && file.endsWith(".csv"));
    if (hasExistingData) {
      console.log("Race already has result data; skipping.");
      return { success: true, years: [], existing: true };
    }
  }

  if (targetYear && missingOnly) {
    const outputFile = path.join(RESULTS_DIR, `${raceName}_${targetYear}.csv`);
    if (fsSync.existsSync(outputFile)) {
      console.log(`${targetYear}: Already exists; skipping.`);
      return { success: true, years: [], existing: true };
    }
  }

  let resultsUrl;
  try {
    resultsUrl = await resolveResultsUrl(inputUrl);
  } catch (error) {
    if (targetYear && isUnavailableResultsError(error)) {
      console.log(`${targetYear}: Results page unavailable; will retry later.`);
      return { success: false, years: [], noResults: true };
    }
    throw error;
  }

  let jsonData;
  try {
    jsonData = await fetchNextData(resultsUrl);
  } catch (error) {
    if (targetYear && isUnavailableResultsError(error)) {
      console.log(`${targetYear}: Results data unavailable; will retry later.`);
      return { success: false, years: [], noResults: true };
    }
    throw error;
  }
  const subEvents = jsonData?.props?.pageProps?.subevents;

  if (!subEvents || subEvents.length === 0) {
    console.log("No events found for this race.");
    return { success: false, years: [], noResults: true };
  }

  console.log(`Found ${subEvents.length} year(s) of results.`);
  const years = [];
  const selectedEvents = targetYear
    ? subEvents.filter(event =>
        getYearFromName(event.wtc_name || event.wtc_externaleventname) === targetYear)
    : subEvents;

  if (selectedEvents.length === 0) {
    console.log(`${targetYear}: No matching event found; will retry later.`);
    return { success: false, years: [], noResults: true };
  }

  for (const event of selectedEvents) {
    const eventUuid = event.wtc_eventid;
    const eventYear = getYearFromName(event.wtc_name || event.wtc_externaleventname);

    if (!eventUuid || !eventYear) {
      console.log(`  Skipping event (missing uuid or year): ${event.wtc_name}`);
      continue;
    }

    try {
      const resultsData = await fetchResultsForEvent(eventUuid);

      if (!resultsData || resultsData.length === 0) {
        console.log(`  ${eventYear}: No results found.`);
        continue;
      }

      const csvData = convertToCSV(resultsData);
      const outputFile = path.join(RESULTS_DIR, `${raceName}_${eventYear}.csv`);

      await fs.writeFile(outputFile, csvData);
      console.log(`  ${eventYear}: Saved ${resultsData.length} results.`);
      years.push(eventYear);
    } catch (err) {
      if (targetYear && isUnavailableResultsError(err)) {
        console.log(`  ${eventYear}: Results unavailable; will retry later.`);
        return { success: false, years: [], noResults: true };
      }
      console.error(`  ${eventYear}: Error - ${err.message}`);
      throw err;
    }
  }

  return { success: true, years };
}

/**
 * Interactive mode - prompt for URL and name.
 */
async function interactiveMode() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

  try {
    const inputUrl = await ask("Paste the results URL: ");
    if (!inputUrl.startsWith("http")) {
      throw new Error("Invalid URL.");
    }

    let raceName = extractRaceName(inputUrl);
    if (!raceName) {
      raceName = await ask("Enter a base name for the event (e.g., chattanooga): ");
      raceName = raceName.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    } else {
      console.log(`Using race name: ${raceName}`);
    }

    await scrapeRace(inputUrl, raceName);
  } finally {
    rl.close();
  }
}

/**
 * Batch mode - process a file of URLs.
 */
async function batchMode(filePath, options = {}) {
  const content = fsSync.readFileSync(filePath, "utf-8");
  const urlSet = new Set(
    content.split("\n").map(l => l.trim()).filter(l => l && l.startsWith("http"))
  );

  if (options.includeKnownRaces) {
    for (const file of fsSync.readdirSync(RESULTS_DIR)) {
      const match = file.match(/^([a-z0-9-]+)_20\d{2}\.csv$/);
      if (match) {
        urlSet.add(`https://www.ironman.com/races/im703-${match[1]}`);
      }
    }
  }

  const urls = [...urlSet].sort();

  console.log(`Found ${urls.length} races to scrape.\n`);

  const results = { success: 0, failed: 0, skipped: 0 };

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const raceName = extractRaceName(url);
    let madeRequest = false;

    if (!raceName) {
      console.log(`Skipping (can't extract name): ${url}`);
      results.skipped++;
      continue;
    }

    madeRequest = true;
    try {
      const { success, years, existing, noResults } =
        await scrapeRace(url, raceName, options);
      if (existing) madeRequest = false;
      if (success && years.length > 0) {
        results.success++;
      } else if (existing || noResults) {
        results.skipped++;
      } else {
        results.skipped++;
      }
    } catch (err) {
      console.error(`Failed: ${raceName} - ${err.message}`);
      results.failed++;
    }

    // Delay after network requests, but not after local existing-data skips.
    if (madeRequest && i < urls.length - 1) {
      console.log(`Waiting ${DELAY_BETWEEN_RACES / 1000}s before next race...`);
      await new Promise(r => setTimeout(r, DELAY_BETWEEN_RACES));
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Success: ${results.success}`);
  console.log(`Failed: ${results.failed}`);
  console.log(`Skipped: ${results.skipped}`);

  if (results.failed > 0) {
    throw new Error(`${results.failed} race${results.failed === 1 ? "" : "s"} failed`);
  }
}

async function historicalBatchMode(filePath, options = {}) {
  const registry = JSON.parse(fsSync.readFileSync(filePath, "utf-8"));
  const allRecords = validateHistoricalRegistry(registry);
  const records = options.targetYear
    ? allRecords.filter(record => record.year === options.targetYear)
    : allRecords;

  if (records.length === 0) {
    throw new Error(`Historical registry contains no events for ${options.targetYear}`);
  }

  console.log(`Found ${records.length} historical event(s) to import.`);
  const results = { imported: 0, failed: 0, skipped: 0, athletes: 0 };

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    let madeRequest = false;

    try {
      madeRequest = !(options.missingOnly &&
        fsSync.existsSync(path.join(RESULTS_DIR, `${record.raceId}_${record.year}.csv`)));
      const outcome = await importHistoricalEvent(record, options);
      if (outcome.imported) {
        results.imported++;
        results.athletes += outcome.athleteCount;
      } else {
        results.skipped++;
      }
    } catch (error) {
      console.error(`Failed: ${record.raceId} ${record.year} - ${error.message}`);
      results.failed++;
    }

    if (madeRequest && i < records.length - 1) {
      console.log(`Waiting ${DELAY_BETWEEN_RACES / 1000}s before next event...`);
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_RACES));
    }
  }

  console.log("\n=== Historical import summary ===");
  console.log(`Imported: ${results.imported}`);
  console.log(`Athletes: ${results.athletes}`);
  console.log(`Failed: ${results.failed}`);
  console.log(`Skipped: ${results.skipped}`);

  if (results.failed > 0) {
    throw new Error(
      `${results.failed} historical event${results.failed === 1 ? "" : "s"} failed`
    );
  }
}

function parseArguments(args) {
  const options = {
    targetYear: null,
    missingOnly: false,
    newRacesOnly: false,
    includeKnownRaces: false,
  };
  let input = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--missing-only") {
      options.missingOnly = true;
    } else if (arg === "--new-races-only") {
      options.newRacesOnly = true;
    } else if (arg === "--include-known-races") {
      options.includeKnownRaces = true;
    } else if (arg === "--year") {
      const value = args[++i];
      if (!value) throw new Error("--year requires a value");
      options.targetYear = value === "current"
        ? String(new Date().getUTCFullYear())
        : value;
      if (!/^20\d{2}$/.test(options.targetYear)) {
        throw new Error(`Invalid year: ${value}`);
      }
    } else if (!input) {
      input = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }

  return { input, options };
}

function validateOptionsForMode(input, options) {
  const historicalMode = input?.endsWith(".json");
  if (historicalMode) {
    if (options.newRacesOnly || options.includeKnownRaces) {
      throw new Error(
        "--new-races-only and --include-known-races are not supported for historical registries"
      );
    }
    return;
  }

  if ((options.missingOnly || options.newRacesOnly) && !options.targetYear) {
    throw new Error("--missing-only and --new-races-only require --year");
  }
}

/**
 * Main entry point.
 */
async function main() {
  try {
    const { input: arg, options } = parseArguments(process.argv.slice(2));
    validateOptionsForMode(arg, options);
    if (!arg) {
      // Interactive mode
      await interactiveMode();
    } else if (arg.endsWith(".json")) {
      // Historical registry mode - direct event UUID imports
      await historicalBatchMode(arg, options);
    } else if (arg.endsWith(".txt")) {
      // Batch mode - file of URLs
      await batchMode(arg, options);
    } else if (arg.startsWith("http")) {
      // Single URL mode
      const raceName = extractRaceName(arg);
      if (!raceName) {
        throw new Error("Could not extract race name from URL. Use format: im703-racename");
      }
      await scrapeRace(arg, raceName, options);
    } else {
      console.error("Usage:");
      console.error("  node scripts/scraper.js                     # Interactive mode");
      console.error("  node scripts/scraper.js <url>               # Single race");
      console.error("  node scripts/scraper.js races.txt           # Batch mode");
      console.error("  node scripts/scraper.js races.txt --year current --missing-only");
      console.error("  node scripts/scraper.js races.txt --year current --missing-only --include-known-races");
      console.error("  node scripts/scraper.js historical-races.json --missing-only");
      process.exit(1);
    }
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  getYearFromName,
  parseArguments,
  validateHistoricalRegistry,
  validateHistoricalResults,
  validateOptionsForMode,
};
