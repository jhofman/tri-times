/**
 * Fetch all Ironman 70.3 race URLs from ironman.com
 *
 * Queries the Drupal views AJAX endpoint to get paginated race listings.
 * Writes results to races.txt in the repo root as it goes.
 *
 * Usage: node scripts/fetch-race-list.js
 */

const fs = require('fs');
const path = require('path');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36';
const OUTPUT_FILE = path.join(__dirname, '..', 'races.txt');

async function fetchRacePage(page) {
  const url = new URL('https://www.ironman.com/views/ajax');
  url.searchParams.set('_wrapper_format', 'drupal_ajax');
  url.searchParams.set('view_name', 'races_v2');
  url.searchParams.set('view_display_id', 'block_1');
  url.searchParams.set('view_path', '/node/108781');
  url.searchParams.set('pager_element', '0');
  url.searchParams.set('facet[0]', 'race:IRONMAN 70.3');
  url.searchParams.set('page', String(page));
  url.searchParams.set('_drupal_ajax', '1');

  const response = await fetch(url.toString(), {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
}

function extractRaceIds(json) {
  const raceIds = [];

  for (const item of json) {
    if (item.data && typeof item.data === 'string') {
      const matches = item.data.match(/href="https:\/\/www\.ironman\.com\/races\/(im703-[^"]+)"/g);
      if (matches) {
        matches.forEach(m => {
          const id = m.match(/\/races\/(im703-[^"]+)/)[1];
          raceIds.push(id);
        });
      }
    }
  }

  return raceIds;
}

async function main() {
  const allRaceIds = new Set();
  let page = 0;

  // Clear/create output file
  fs.writeFileSync(OUTPUT_FILE, '');

  console.log('Fetching Ironman 70.3 races from ironman.com...\n');

  while (true) {
    try {
      process.stdout.write(`Fetching page ${page}...`);
      const json = await fetchRacePage(page);
      const newIds = extractRaceIds(json);

      if (newIds.length === 0) {
        console.log(' no more races.');
        break;
      }

      // Add new races and write to file as we go
      const beforeSize = allRaceIds.size;
      newIds.forEach(id => allRaceIds.add(id));
      const added = allRaceIds.size - beforeSize;

      console.log(` +${added} races (${allRaceIds.size} total)`);

      // Append new races to file
      if (added > 0) {
        const newRaces = newIds
          .filter(id => !Array.from(allRaceIds).slice(0, beforeSize).includes(id))
          .map(id => `https://www.ironman.com/races/${id}`)
          .join('\n');
        fs.appendFileSync(OUTPUT_FILE, (beforeSize > 0 ? '\n' : '') + newRaces);
      }

      page++;

      if (page > 50) {
        console.log('Reached page limit.');
        break;
      }

      // Be polite
      await new Promise(r => setTimeout(r, 500));

    } catch (e) {
      console.log(` error: ${e.message}`);
      break;
    }
  }

  // Write final sorted list
  const races = [...allRaceIds].sort();
  fs.writeFileSync(OUTPUT_FILE, races.map(id => `https://www.ironman.com/races/${id}`).join('\n') + '\n');

  console.log(`\nDone! Found ${races.length} races.`);
  console.log(`Saved to ${OUTPUT_FILE}`);
}

main();
