/**
 * Fetch all Ironman 70.3 race URLs from ironman.com
 *
 * Reads the public, server-rendered race listing pages.
 * Replaces races.txt atomically after a complete, validated fetch.
 *
 * Usage: node scripts/fetch-race-list.js
 */

const fs = require('fs');
const path = require('path');

const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const RACES_URL = process.env.IRONMAN_RACES_URL || 'https://www.ironman.com/races';
const OUTPUT_FILE = process.env.RACES_OUTPUT_FILE
  ? path.resolve(process.env.RACES_OUTPUT_FILE)
  : path.join(__dirname, '..', 'races.txt');
const TEMP_FILE = `${OUTPUT_FILE}.tmp`;
const MIN_EXPECTED_RACES = 50;
const MIN_RETAINED_FRACTION = 0.75;

async function fetchRacePage(page) {
  const url = new URL(RACES_URL);
  if (page > 0) url.searchParams.set('page', String(page));

  for (let attempt = 1; attempt <= 3; attempt++) {
    let retryDelayMs = attempt * 5000;
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: AbortSignal.timeout(30000),
      });

      if (response.ok) {
        const html = await response.text();
        const hasListing = html.includes('views-exposed-form-races-v2-block-1');
        const hasRaceCard = /href="https:\/\/www\.ironman\.com\/races\/(?:im|im703|5150)-[a-z0-9-]+"/.test(html);
        if (hasListing && hasRaceCard) return html;
        if (attempt === 3) {
          throw new Error(`Page ${page} returned no race listing content`);
        }
        console.log(' incomplete page; retrying...');
      } else {
        if (![403, 429].includes(response.status) && response.status < 500) {
          throw new Error(`HTTP ${response.status}`);
        }
        if (response.status === 429) {
          const retryAfter = Number(response.headers.get('retry-after'));
          retryDelayMs = Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : attempt * 30000;
        }
        if (attempt === 3) throw new Error(`HTTP ${response.status}`);
        console.log(` HTTP ${response.status}; retrying...`);
      }
    } catch (error) {
      if (attempt === 3) throw error;
      console.log(` ${error.message}; retrying...`);
    }

    await new Promise(resolve => setTimeout(resolve, retryDelayMs));
  }
}

function extractRaceIds(html) {
  const matches = html.matchAll(
    /href="https:\/\/www\.ironman\.com\/races\/(im703-[a-z0-9-]+)"/g
  );
  return [...new Set([...matches].map(match => match[1]))];
}

function hasNextPage(html, page) {
  return html.includes(`href="?page=${page + 1}"`) &&
    html.includes('rel="next"');
}

async function main() {
  const allRaceIds = new Set();
  let page = 0;

  console.log('Fetching Ironman 70.3 races from ironman.com...\n');

  while (true) {
    process.stdout.write(`Fetching page ${page}...`);
    const html = await fetchRacePage(page);
    const newIds = extractRaceIds(html);

    const beforeSize = allRaceIds.size;
    newIds.forEach(id => allRaceIds.add(id));
    const added = allRaceIds.size - beforeSize;
    console.log(` +${added} races (${allRaceIds.size} total)`);

    if (!hasNextPage(html, page)) {
      console.log('Reached final page.');
      break;
    }

    page++;
    if (page > 50) {
      throw new Error('Race listing exceeded the 50-page safety limit');
    }

    await new Promise(r => setTimeout(r, 3000));
  }

  const races = [...allRaceIds].sort();
  if (races.length < MIN_EXPECTED_RACES) {
    throw new Error(
      `Fetched only ${races.length} races; expected at least ${MIN_EXPECTED_RACES}`
    );
  }
  if (fs.existsSync(OUTPUT_FILE)) {
    const previousCount = fs.readFileSync(OUTPUT_FILE, 'utf8')
      .split('\n')
      .filter(line => line.trim()).length;
    if (previousCount > 0 && races.length < previousCount * MIN_RETAINED_FRACTION) {
      throw new Error(
        `Fetched ${races.length} races, less than 75% of the previous ${previousCount}`
      );
    }
  }
  if (races.some(id => !/^im703-[a-z0-9-]+$/.test(id))) {
    throw new Error('Fetched race list contains an invalid race identifier');
  }

  const output = races
    .map(id => `https://www.ironman.com/races/${id}`)
    .join('\n') + '\n';
  fs.writeFileSync(TEMP_FILE, output);
  fs.renameSync(TEMP_FILE, OUTPUT_FILE);

  console.log(`\nDone! Found ${races.length} races.`);
  console.log(`Saved to ${OUTPUT_FILE}`);
}

main().catch(error => {
  if (fs.existsSync(TEMP_FILE)) fs.unlinkSync(TEMP_FILE);
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
