/**
 * Ironman Results Scraper
 *
 * Original source: https://github.com/colinlord/ironman-results
 * Author: Colin Lord
 *
 * This script fetches race results from the Ironman API and saves them as CSV files.
 *
 * Usage: node scripts/scraper.js
 *   - Enter the results URL (either ironman.com or labs-v2.competitor.com)
 *   - Enter a base name for output files (e.g., "northcarolina")
 *   - CSV files will be saved to the results/ directory
 */

const fs = require("fs/promises");
const path = require("path");
const readline = require("readline");

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36";

/**
 * Resolves a URL to the labs-v2.competitor.com results URL.
 * Handles both direct labs-v2 URLs and ironman.com results pages with iframes.
 */
async function resolveResultsUrl(url) {
  // If already a labs-v2.competitor.com URL, return as-is
  if (url.includes("labs-v2.competitor.com")) {
    return url;
  }

  // If it's an ironman.com/races/... URL without /results, add it
  if (url.match(/ironman\.com\/races\/[^/]+\/?$/) && !url.endsWith("/results")) {
    url = url.replace(/\/?$/, "/results");
    console.log(`Added /results to URL: ${url}`);
  }

  // Fetch the ironman.com page and find the iframe
  console.log("Fetching ironman.com page to find results iframe...");

  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch URL. Status: ${response.status}`);
  }

  const html = await response.text();

  // Look for iframe with labs-v2.competitor.com src
  const iframeMatch = html.match(/src=["'](https:\/\/labs-v2\.competitor\.com\/results\/event\/[^"']+)["']/);

  if (!iframeMatch) {
    throw new Error(
      "Could not find results iframe on this page. Make sure you're on a results page (e.g., ironman.com/races/im703-north-carolina/results)"
    );
  }

  const iframeUrl = iframeMatch[1];
  console.log(`Found results iframe: ${iframeUrl}`);
  return iframeUrl;
}

/**
 * Creates a readline interface and returns a helper function
 * to ask questions as a Promise.
 */
function createQuestionInterface() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return {
    ask: (query) => new Promise((resolve) => rl.question(query, resolve)),
    close: () => rl.close(),
  };
}

/**
 * Fetches the HTML from the Group URL and extracts the __NEXT_DATA__ blob.
 */
async function fetchNextData(url) {
  console.log(`Fetching event data from: ${url}`);

  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch URL. Status: ${response.status}`);
  }

  const htmlContent = await response.text();
  const regex =
    /<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s;
  const match = htmlContent.match(regex);

  if (!match || !match[1]) {
    throw new Error(
      "Could not find __NEXT_DATA__ script tag in the fetched HTML."
    );
  }

  console.log("Found JSON data. Parsing...");
  return JSON.parse(match[1]);
}

/**
 * Fetches the results JSON for a specific event UUID from the API.
 */
async function fetchResultsForEvent(eventUuid) {
  const API_URL = `https://labs-v2.competitor.com/api/results?wtc_eventid=${eventUuid}`;
  console.log(`Fetching results from API for event: ${eventUuid}`);

  const response = await fetch(API_URL, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`API request failed with status: ${response.status}`);
  }

  const data = await response.json();

  if (data && data.resultsJson && data.resultsJson.value) {
    return data.resultsJson.value;
  }

  throw new Error('API response did not contain "resultsJson.value".');
}

/**
 * Converts the array of results (from the API) into a CSV string.
 */
function convertToCSV(data) {
  const headers = [
    "Bib Number",
    "Athlete Name",
    "Gender",
    "City",
    "State",
    "Country",
    "Division",
    "Status",
    "Finish Time",
    "Swim Time",
    "T1 Time",
    "Bike Time",
    "T2 Time",
    "Run Time",
    "Overall Rank",
    "Gender Rank",
    "Division Rank",
    "AWA Points",
    "Swim Rank (Overall)",
    "Swim Rank (Gender)",
    "Swim Rank (Division)",
    "Bike Rank (Overall)",
    "Bike Rank (Gender)",
    "Bike Rank (Division)",
    "Run Rank (Overall)",
    "Run Rank (Gender)",
    "Run Rank (Division)",
    "Finish (Seconds)",
    "Swim (Seconds)",
    "T1 (Seconds)",
    "Bike (Seconds)",
    "T2 (Seconds)",
    "Run (Seconds)",
  ];

  const rows = data.map((r) => {
    return {
      "Bib Number": r.bib,
      "Athlete Name": r.athlete,
      Gender: r.wtc_ContactId?.gendercode_formatted || "",
      City: r.wtc_ContactId?.address1_city || "",
      State: r.wtc_ContactId?.address1_stateorprovince || "",
      Country: r.countryiso2,
      Division:
        r.wtc_AgeGroupId?.wtc_agegroupname || r.wtc_DivisionId?.wtc_name || "",
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
    };
  });

  const headerRow = headers.join(",");

  const dataRows = rows.map((row) => {
    return headers
      .map((header) => {
        let value = String(row[header] || "");
        value = value.replace(/"/g, '""');
        return `"${value}"`;
      })
      .join(",");
  });

  return [headerRow, ...dataRows].join("\n");
}

/**
 * Extracts a 4-digit year from a string.
 */
function getYearFromName(eventName) {
  if (!eventName) return null;
  const match = eventName.match(/\b(20\d{2})\b/);
  return match ? match[1] : null;
}

/**
 * Main function to run the script
 */
(async () => {
  const io = createQuestionInterface();

  try {
    const inputUrl = await io.ask("Paste the results URL (ironman.com or labs-v2.competitor.com): ");
    if (!inputUrl.startsWith("http")) {
      throw new Error("Invalid URL.");
    }

    let eventNameBase = await io.ask(
      "Enter a base name for the event (e.g., chattanooga): "
    );
    eventNameBase = eventNameBase
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]/g, "");

    // Resolve to labs-v2 URL if needed
    const resultsUrl = await resolveResultsUrl(inputUrl);

    const jsonData = await fetchNextData(resultsUrl);
    const pageProps = jsonData?.props?.pageProps;

    const subEvents = pageProps?.subevents;

    if (!subEvents || subEvents.length === 0) {
      throw new Error(
        'Could not find "subevents" in the JSON data. Cannot find list of events.'
      );
    }

    console.log(`Found ${subEvents.length} total events to scrape.`);

    for (const event of subEvents) {
      const eventUuid = event.wtc_eventid;
      const eventYear = getYearFromName(
        event.wtc_name || event.wtc_externaleventname
      );

      if (!eventUuid || !eventYear) {
        console.log(
          `Found an event with missing uuid or year. Skipping. (Name: ${event.wtc_name})`
        );
        continue;
      }

      console.log(`--- Processing Event: ${eventYear} ---`);

      try {
        const resultsData = await fetchResultsForEvent(eventUuid);

        if (!resultsData || resultsData.length === 0) {
          console.log(`No results found for ${eventYear}. Skipping.`);
          continue;
        }

        const csvData = convertToCSV(resultsData);

        const outputFile = `results/${eventNameBase}_${eventYear}.csv`;

        await fs.writeFile(outputFile, csvData);
        console.log(
          `Saved ${resultsData.length} results to ${outputFile}`
        );
      } catch (apiError) {
        console.error(
          `Failed to process ${eventYear} (UUID: ${eventUuid}). Error: ${apiError.message}`
        );
      }
    }
  } catch (error) {
    console.error("An error occurred:", error.message);
  } finally {
    io.close();
  }
})();
