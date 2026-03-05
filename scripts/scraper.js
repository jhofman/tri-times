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

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36";
const DELAY_BETWEEN_RACES = 5000; // 5 seconds between races when batch processing

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

  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch URL. Status: ${response.status}`);
  }

  const html = await response.text();
  const iframeMatch = html.match(/src=["'](https:\/\/labs-v2\.competitor\.com\/results\/event\/[^"']+)["']/);

  if (!iframeMatch) {
    throw new Error("Could not find results iframe on this page.");
  }

  return iframeMatch[1];
}

/**
 * Fetches the __NEXT_DATA__ blob from a page.
 */
async function fetchNextData(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch URL. Status: ${response.status}`);
  }

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
  const response = await fetch(`https://labs-v2.competitor.com/api/results?wtc_eventid=${eventUuid}`, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`API request failed with status: ${response.status}`);
  }

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

/**
 * Scrape a single race URL.
 */
async function scrapeRace(inputUrl, raceName) {
  console.log(`\n=== Scraping ${raceName} ===`);
  console.log(`URL: ${inputUrl}`);

  const resultsUrl = await resolveResultsUrl(inputUrl);
  const jsonData = await fetchNextData(resultsUrl);
  const subEvents = jsonData?.props?.pageProps?.subevents;

  if (!subEvents || subEvents.length === 0) {
    console.log("No events found for this race.");
    return { success: false, years: [] };
  }

  console.log(`Found ${subEvents.length} year(s) of results.`);
  const years = [];

  for (const event of subEvents) {
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
      const outputFile = `results/${raceName}_${eventYear}.csv`;

      await fs.writeFile(outputFile, csvData);
      console.log(`  ${eventYear}: Saved ${resultsData.length} results.`);
      years.push(eventYear);
    } catch (err) {
      console.error(`  ${eventYear}: Error - ${err.message}`);
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
async function batchMode(filePath) {
  const content = fsSync.readFileSync(filePath, "utf-8");
  const urls = content.split("\n").map(l => l.trim()).filter(l => l && l.startsWith("http"));

  console.log(`Found ${urls.length} races to scrape.\n`);

  const results = { success: 0, failed: 0, skipped: 0 };

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const raceName = extractRaceName(url);

    if (!raceName) {
      console.log(`Skipping (can't extract name): ${url}`);
      results.skipped++;
      continue;
    }

    try {
      const { success, years } = await scrapeRace(url, raceName);
      if (success && years.length > 0) {
        results.success++;
      } else {
        results.skipped++;
      }
    } catch (err) {
      console.error(`Failed: ${raceName} - ${err.message}`);
      results.failed++;
    }

    // Delay between races (except for last one)
    if (i < urls.length - 1) {
      console.log(`Waiting ${DELAY_BETWEEN_RACES / 1000}s before next race...`);
      await new Promise(r => setTimeout(r, DELAY_BETWEEN_RACES));
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Success: ${results.success}`);
  console.log(`Failed: ${results.failed}`);
  console.log(`Skipped: ${results.skipped}`);
}

/**
 * Main entry point.
 */
(async () => {
  const arg = process.argv[2];

  try {
    if (!arg) {
      // Interactive mode
      await interactiveMode();
    } else if (arg.endsWith(".txt")) {
      // Batch mode - file of URLs
      await batchMode(arg);
    } else if (arg.startsWith("http")) {
      // Single URL mode
      const raceName = extractRaceName(arg);
      if (!raceName) {
        throw new Error("Could not extract race name from URL. Use format: im703-racename");
      }
      await scrapeRace(arg, raceName);
    } else {
      console.error("Usage:");
      console.error("  node scripts/scraper.js                     # Interactive mode");
      console.error("  node scripts/scraper.js <url>               # Single race");
      console.error("  node scripts/scraper.js races.txt           # Batch mode");
      process.exit(1);
    }
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  }
})();
