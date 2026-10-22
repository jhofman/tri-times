# tri-times

Interactive visualization of Ironman 70.3 triathlon race results. View split time distributions, compare races, browse race stats, look up athletes, and predict race times.

![Single Race View](screenshots/single-race.png)

![Race Comparison](screenshots/compare-races.png)

## Features

- **Single Race View**: Responsive split distributions with quartile ranges, pace summaries, and athlete markers
- **Course Profiles**: Source-backed course details plus cautious result-derived outlier notes for selected races
- **Race Comparison**: Normalized overlays for comparing distribution shape across two races
- **Race List**: Sortable table of all races with percentile-based split times (5th–95th)
- **Athlete Search**: Look up any athlete across all races with per-split percentile rankings
- **Race Predictor**: Project an athlete's time in any race using their historical percentile profile
- **Division Filtering**: Filter by age group, gender, or view everyone
- **Shareable URLs**: All page state is reflected in the URL for easy sharing
- **Light/Dark Theme**: Toggle between themes

## Quick Start

```bash
# Clone the repository
git clone https://github.com/jhofman/tri-times.git
cd tri-times

# Start a local server
npm start

# Open in browser
open http://localhost:8080
```

## Adding New Races

Race data is fetched from the Ironman results API using the included scraper (based on [ironman-results](https://github.com/colinlord/ironman-results) by Colin Lord).

```bash
# Fetch results for a single race (interactive)
npm run fetch-results

# Or pass a URL directly
npm run fetch-results -- https://www.ironman.com/races/im703-chattanooga

# Fetch results for ALL 70.3 races (takes a while!)
npm run fetch-all-results

# Update the list of available races from ironman.com
npm run fetch-race-list

# Fetch missing current-year results for active and previously tracked races
npm run fetch-new-results

# Fetch registered historical events whose original race pages are unavailable
npm run fetch-historical-results

# Regenerate races.json, race-stats.json, course observations, and athlete index shards
npm run update-manifest
```

CSV files are saved to `results/` and the manifest at `results/races.json` lists available races.

### Course profiles

`results/course-metadata.json` stores curated facts from official Ironman race
pages, athlete guides, and course maps; `npm run fetch-course-conditions`
refreshes typical air/water temperatures from the race pages. `npm run update-manifest` separately
generates `results/course-observations.json` from race-year medians so observed
patterns are never presented as official course facts. See
[`docs/course-metadata.md`](docs/course-metadata.md) for the schema, provenance,
fallback, and signal rules.

### Historical and retired races

`historical-races.json` records retired race-years by canonical race ID, year,
and Competitor event UUID. The historical importer queries those UUIDs directly,
so it does not depend on the race still appearing on ironman.com.
Known nonstandard or incomplete race-years can be retained under
`excludedEvents` with a reason; the importer only fetches entries in `events`.

```bash
# Import every missing event in the registry
npm run fetch-historical-results

# Or import one registered year
node scripts/scraper.js historical-races.json --year 2023 --missing-only
```

Add and validate all desired historical CSVs before running
`npm run update-manifest`; regenerating derived athlete indexes once per batch
keeps Git history and pull request diffs smaller.

### Weekly data updates

The **Update race data** GitHub Actions workflow runs every Monday and can also
be started manually from the Actions tab. It refreshes `races.txt`, fetches
missing current-year results for the union of active races and races already
represented in the local CSV archive, regenerates derived data when needed,
adds official course profiles for races that do not have one yet
(`npm run fetch-course-conditions -- --missing-only`), and opens or updates
`automation/weekly-race-update` as a pull request for review.

To let the built-in `GITHUB_TOKEN` open that pull request, enable:
**Settings → Actions → General → Workflow permissions → Allow GitHub Actions
to create and approve pull requests**.

For a full historical refresh, run `npm run fetch-all-results` locally before
`npm run update-manifest`.

## Project Structure

```
tri-times/
├── index.html              # Single race view
├── compare.html            # Race comparison view
├── races.html              # Race list with sortable stats
├── athlete.html            # Athlete search
├── predict.html            # Race time predictor
├── races.txt               # List of all 70.3 race URLs
├── historical-races.json   # Retired race-years and Competitor event UUIDs
├── css/
│   └── style.css           # Styles with light/dark themes
├── js/
│   ├── shared.js           # Utilities, data loading, caching
│   ├── nav.js              # Shared navigation and inline icons
│   ├── theme.js            # Theme toggle
│   ├── histogram.js        # Shared histogram renderer
│   ├── app.js              # Single race histograms
│   ├── compare.js          # Race comparison logic
│   ├── races.js            # Race list table
│   ├── athlete-lookup.js   # Athlete search with sharded index
│   └── predict.js          # Race predictor with interpolation
├── .github/workflows/
│   └── update-races.yml    # Weekly current-year data update PR
├── results/
│   ├── races.json          # Race manifest (names, years)
│   ├── race-stats.json     # Pre-computed percentile stats per race
│   ├── course-metadata.json # Curated official course profiles and sources
│   ├── course-observations.json # Generated course and race-year result signals
│   ├── athletes/           # Full athlete records (by first-name initial)
│   ├── athlete-search/     # Compact name search index (by token prefix)
│   └── *.csv               # Race data files
└── scripts/
    ├── scraper.js          # Fetch race results
    ├── scraper.test.js     # Scraper and historical registry tests
    ├── course-observations.js # Generate conservative course and year signals
    ├── fetch-race-list.js  # Update races.txt
    └── update-manifest.js  # Regenerate races.json, stats, and athlete index
```

See [`docs/data-storage.md`](docs/data-storage.md) for current repository size
constraints and guidance for larger historical imports.

## Data Format

CSV files contain the following columns:
- Athlete info: Bib Number, Athlete Name, Gender, City, State, Country, Division
- Times: Swim Time, T1 Time, Bike Time, T2 Time, Run Time, Finish Time
- Times in seconds: Swim (Seconds), T1 (Seconds), Bike (Seconds), T2 (Seconds), Run (Seconds), Finish (Seconds)
- Rankings: Overall Rank, Gender Rank, Division Rank, plus per-leg rankings

## Technologies

- [D3.js](https://d3js.org/) v7 for data visualization
- [Choices.js](https://choices-js.github.io/Choices/) for searchable dropdowns
- [Font Awesome Free](https://fontawesome.com/) icons for course profiles
- Vanilla JavaScript (no build step required)
- CSS custom properties for theming
- Inline SVG icons

## License

MIT
