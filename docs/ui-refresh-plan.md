# Tri Times UI refresh — implementation plan

Status: implemented on `jhofman/ui-refresh` (2026-09-07).
Companion mockup: [`docs/mockups/histogram-mockups.html`](mockups/histogram-mockups.html) — open it directly in a browser (no server needed). "Toggle dark" is top right; append `#dark` to the URL to load it dark. Variant IDs below (A1–A4, B1–B3, C1–C3, D, P) refer to the cards on that page. It uses real New York 2025 data, with a highlighted athlete who sits exactly at the median overall time (the worst case for label collisions).

Constraints that hold throughout: no framework, no build step, plain ES2020 in `js/`, keep d3 v7 and Choices.js, keep every URL parameter and its meaning, do not touch `results/` or `scripts/`.

---

## 1. What's wrong today

Observed at 1280px and 390px wide, light and dark, on all five pages.

### Chrome and navigation
- Every page repeats the same block: `<h1>Tri Times</h1>` plus a paragraph of five links that duplicates the nav directly above it. It costs ~120px before any content and wraps to four lines on mobile.
- Nav items are two words each; at 390px they wrap into two-line items ("Single / Race").
- `<title>` is "Tri Times" on every page and no page has its own heading, so tabs, history, and bookmarks are indistinguishable.
- The theme toggle is a fixed circle at bottom-left. It overlaps table rows on Race List and chart cards on mobile.
- Dark tokens are the `:root` default and `js/theme.js` adds `light-theme` from the end of `<body>`, so a light-mode user can see a dark flash on load. `prefers-color-scheme` is ignored.
- Font Awesome's full stylesheet is loaded for three icons (moon/sun, ×, external link).
- Controls have three slightly different heights/borders/focus rings (native `select`, Choices.js, text inputs). The focus ring colour is hard-coded to the dark-theme blue.

### Single-race histograms (`js/app.js`)
- Quartile labels sit on three tiers above the plot (`y = -2 / -14 / -2`). When quartiles are close (T1, T2: 0:04 / 0:05 / 0:07) the 25th and 75th labels overlap and the median label sits on its own line.
- The athlete label ("Mcguinness 0:44 (42%)") is a fourth tier at `y = -26`, and the dashed athlete line runs up through the quartile labels. With an athlete near the median, three labels and two lines share the same 30px.
- Selecting an athlete switches the division to their age group (often 40–80 athletes) but the bin count stays fixed at 40, giving sparse, spiky histograms with many single-athlete bars.
- x-axis ticks come from `d3.ticks` over raw seconds, so labels land on odd values (0:33, 0:50, 1:06) rather than round minutes.
- Bars are 60%-alpha ColorBrewer fills with 2px gaps. The palette mixes Set1 (saturated) with Paired pastels for T1/T2, so the six cards don't read as one set.
- The y-axis spine and tick marks compete with the quartile lines.

### Compare histograms (`js/compare.js`)
- Two 50%-alpha bar sets overlap to brown; you can't tell which race is in front.
- Median labels are stacked at `-2 / -12`; when medians are close (Bike 3:02 vs 3:03) they stack directly on top of each other.
- No tooltip on compare bars.
- The y-axis is a raw count, so a 1,800-finisher race and a 2,200-finisher race look like different distributions even when the shapes match.
- `drawHistogram` and `drawComparisonHistogram` are two separate ~120-line functions; every change has to be made twice. `updateStats()` in compare.js is dead code.

### Tables and other pages
- Race List: numeric columns are left-aligned; the "sticky" header can't stick because it's inside an `overflow-x: auto` wrapper.
- Athlete Search: T1/T2 are omitted even though the index has them (indices 3, 5, 10, 12). Race names are derived from ids by capitalising words instead of using the manifest name.
- Predictor: works, but the layout is five bare number inputs and a full-width three-column table for six rows.

---

## 2. Decisions

All decisions were made on 2026-09-06; section 7 is the log. Nothing here is still open.

| Area | Recommendation | Mockup | Alternative |
|---|---|---|---|
| Bars (single race) — decided | Step outline, 1.5px stroke in the split colour with an 18% fill. Horizontal gridlines, no y spine. Invisible per-bin hover rects keep the tooltip; the hovered bin gets a temporary solid fill. | **A4** | — |
| Quartile + athlete labels — decided | Numbers leave the plot. Quartiles go in the card header as `25% 0:39 2:04/100m · 50% 0:44 2:19/100m · 75% 0:49 2:37/100m` (pace muted, hidden under 480px); the athlete becomes a coloured chip under the title with time, pace, and percentile. The plot keeps three dotted quartile lines, a faint IQR band, and a solid athlete marker with a pointer. Hovering any line shows time and pace. | **B2** | — |
| Pace — decided | 70.3 legs are standard distances, so every swim/bike/run time also gets a pace: swim min/100m over 1,900 m, bike mph over 56 mi, run min/mi over 13.1 mi. Imperial only; no unit toggle. T1, T2, and Overall have none. Constants live in one place in `shared.js`. | — | — |
| Compare overlay — decided | Step outline + 18% fill per race (same renderer as single race); medians as dashed coloured lines with values and pace in the header; y-axis as % of finishers, with the athlete counts for the current division filter in a legend under the toolbar and count + percent in every bin tooltip | **C2** | C3 (multiply blend) — looks good in light, goes black in dark, so not recommended |
| Split palette — decided | Harmonised per-split hues at similar luminance, with separate dark-theme values | **P** row 2 | — |
| Athlete marker colour — decided | Text colour (near-black / near-white), 2px solid, small triangle head | B2 | — |
| Page chrome — decided | Slim top bar (wordmark, tabs, theme toggle), page-specific h1 + one-line description, toolbar with the athlete count right-aligned | **D** | — |
| Bins — decided | Adaptive count from n, widths snapped to round seconds | — | Fixed 40 |
| Display domain — decided | Use the pooled P0.5–P99.5 range when there are at least 200 values; use the full range for smaller samples. Always include a highlighted athlete. Statistics still use every valid value, and each series reports values outside the displayed range. | — | Absolute min/max |

---

## 3. Workstreams

### WS1 — Shared chrome (`js/nav.js` new, all five `.html`, `js/theme.js`, `css/style.css`)

1. **Add `js/nav.js`** (loaded before `shared.js`) that injects the top bar as the first child of `body`:
   ```html
   <header class="topbar">
     <a class="brand" href="index.html"><span class="brand-dot"></span>Tri Times</a>
     <nav class="tabs" aria-label="Primary">
       <a href="index.html" data-page="race">Single Race</a>
       <a href="compare.html" data-page="compare">Compare</a>
       <a href="races.html" data-page="races">All Races</a>
       <a href="athlete.html" data-page="athlete">Athletes</a>
       <a href="predict.html" data-page="predict">Predict</a>
     </nav>
     <span class="topbar-spacer"></span>
     <button id="theme-toggle" class="icon-btn" aria-label="Switch theme">[inline svg]</button>
     <a class="icon-btn" href="https://github.com/jhofman/tri-times" aria-label="Source on GitHub">[inline svg]</a>
   </header>
   ```
   The active tab is read from `document.body.dataset.page`; set `aria-current="page"` on it.
2. **Each page**: add `data-page="…"` to `<body>`, delete the `<nav>`, `<h1>`, and `.subtitle` paragraph, and replace with
   ```html
   <div class="page-head"><h1 id="page-title">…</h1><p class="page-desc">…</p></div>
   ```
   Default h1 / description per page:
   - index: "Single race" / "Split time distributions for one race. Highlight an athlete to see where they land."
   - compare: "Compare races" / "Overlay two races. Each chart says which one is typically faster."
   - races: "All races" / "Median (or any percentile) split times for every race in the archive."
   - athlete: "Athlete search" / "Every result for an athlete, with the percentile of each split."
   - predict: "Race predictor" / "Project a finish time from an athlete's percentile profile."
3. **Dynamic titles**: page scripts set `#page-title` and `document.title` once data is known:
   - index: `New York 70.3 · 2025` / `New York 2025 · Tri Times`
   - compare: `North Carolina 2025 vs New York 2025`
   - athlete: the athlete's name once selected
   - predict: `Race predictor` stays; document.title gains the athlete name when one is selected.
4. **Theme bootstrap** — inline in `<head>` of every page, before the stylesheet:
   ```html
   <script>(function(){var t=localStorage.getItem('theme');if(t!=='light'&&t!=='dark')t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.dataset.theme=t;})();</script>
   ```
   CSS: light tokens on `:root`, dark tokens on `:root[data-theme="dark"]`; delete `html.light-theme`. `js/theme.js` shrinks to wiring the button (toggle `data-theme`, write `localStorage.theme`, swap the icon). Keep the storage key and values so existing users keep their choice.
5. **Icons**: replace Font Awesome with four inline SVGs (sun, moon, close, external link) as JS string constants in `nav.js`; remove the `<link>` from every page.
6. **Remove** the fixed bottom-left `.theme-toggle` styles.

### WS2 — Design tokens and CSS cleanup (`css/style.css`)

Keep the existing token names (`--bg-primary`, `--text-secondary`, …) so nothing breaks; add:

```css
:root {
  --accent-ring: rgba(9,105,218,.25);
  --grid: rgba(0,0,0,.07);
  --marker: #1f2328;               /* athlete line */
  --quartile: rgba(31,35,40,.45);  /* quartile lines */
  --iqr-opacity: .09;
  --swim:#2f7fc1; --t1:#63a6d9; --bike:#3a9d5d; --t2:#8cc07a; --run:#d6524a; --finish:#8b5cb8;
  --race-a:#377eb8; --race-b:#ff7f00;
  --radius:10px; --radius-sm:7px; --control-h:36px;
}
:root[data-theme="dark"] {
  --accent-ring: rgba(88,166,255,.3);
  --grid: rgba(255,255,255,.08);
  --marker: #e6edf3; --quartile: rgba(230,237,243,.45);
  --swim:#5aa0e0; --t1:#8cc0ea; --bike:#5cb87a; --t2:#a6d48f; --run:#e8756c; --finish:#a97fd0;
  --race-a:#6aa3d8; --race-b:#ffa04d;
}
```

- **Controls**: one height (`--control-h`), radius (`--radius-sm`), border, and focus ring (`box-shadow: 0 0 0 3px var(--accent-ring)`) for native `select`, `.choices__inner`, text inputs, and `.pctl-input`. Delete the hard-coded `rgba(88,166,255,.2)`.
- **Labels**: `.control-group label` → 0.6875rem, uppercase, letter-spacing .06em, weight 600.
- **Toolbar**: rename `.controls` → keep the class but make it `display:flex; gap:1rem; align-items:flex-end; flex-wrap:wrap`, and give `.stats` `margin-left:auto; align-self:center` so the count sits at the right edge (mockup D). Format counts with `toLocaleString()`.
- **Cards**: `.chart-container` → radius `--radius`, padding `14px 16px 10px`, `.chart-head` flex row (title left, stats right), `.chart-sub` row (min-height 20px so cards don't jump when a chip appears). `.chart-stats` has `flex-wrap:wrap` so it drops under the title when the pace strings don't fit; `.pace { color:var(--text-muted); font-style:normal }` and `display:none` under 480px.
- **Chip**: `.chip { display:inline-flex; gap:6px; font-size:.6875rem; font-weight:600; color:#fff; background:var(--chip); border-radius:999px; padding:1px 8px 1px 6px; max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap }` with `--chip` set inline per split.
- **Tables**: `td.num, th.num { text-align:right; font-variant-numeric:tabular-nums }`; header 0.75rem uppercase `--text-secondary`; row hover `--bg-tertiary`; remove the non-working `position:sticky`; sort arrow as an inline SVG chevron instead of ▲/▼ text.
- **Typography**: `h1` 1.5rem / 650; `tabular-nums` on `.axis text`, `.chart-stats`, `.chip`, tables.
- Delete unused rules: `.comparison`, `.predict-note`, `.median-label`, `.quartile-label`, `.athlete-label`, `.label-race-a/b` (`!important` colours) → use `--race-a/--race-b` via a `.race-dot` before the label.
- `.charts-grid` breakpoint 800px → 820px; `.container` padding 2rem → `clamp(1rem, 3vw, 2rem)`.

### WS3 — Shared histogram module (`js/histogram.js` new)

One renderer used by both pages. Load after `shared.js`, before `app.js` / `compare.js`.

```js
/**
 * renderHistogram(card, opts) → {
 *   series: [{ id, n, q: [q25, q50, q75], athletePct, belowDomain, aboveDomain }],
 *   binWidth
 * }
 * card: the .chart-container element. The function owns the <svg> inside it and recreates it on every call.
 * opts = {
 *   series:  [{ id, values:number[], color:'var(--swim)', label:'New York 2025' }],  // 1 or 2
 *   style:   'outline',                         // A4 / C2 on both pages; 'bars' is out of scope
 *   yMode:   'count' | 'percent',               // percent = share of that series' n per bin
 *   bins:    { count?: number },                // default adaptive (below)
 *   markers: { quartiles: true, band: true, athlete?: { name, value } },  // applied to series[0]
 *   medians: false,                             // compare: dashed median line per series
 *   tooltip: document.getElementById('tooltip')
 * }
 */
```

Rendering spec:
- **Size**: width = card inner width (as today), height 200; margins `top 8, right 8, bottom 26, left 36` — nothing is drawn above the plot any more. Redraw from a `ResizeObserver` on the card (debounced 100ms) instead of `window.resize`.
- **Statistics**: preserve the current nearest-rank method. For sorted values of length `n`, P25/P50/P75 are `sorted[Math.floor(n * p)]` for `p = .25/.5/.75`; do not switch to interpolated `d3.quantileSorted` for displayed statistics.
- **Display domain**: pool all series. With at least 200 pooled values, use interpolated P0.5–P99.5 only to choose the visible range; with fewer than 200, use the full min/max. Expand the range to include a highlighted athlete even when they are outside it. Snap the padded domain outward to bin boundaries. Quartiles, medians, percentages, and percentile ranges are always computed from the full valid series, not only visible values. Return `belowDomain` / `aboveDomain` counts per series and show a compact note such as "7 results outside view" when nonzero.
- **Bins**: `count = clamp(round(1.6 * sqrt(nTotal)), 12, 40)`; snap the width to the nearest of `[10,15,20,30,60,90,120,180,300,600,900]` seconds and align edges to multiples of it. Set the bin domain explicitly and pass only interior thresholds: `d3.range(start + w, end, w)`. Tooltips then read "0:40 – 0:41". n=55 → ~12 bins, n=2,206 → 40. Both comparison series always use the same domain and thresholds.
- **x ticks**: `timeTicks(domain, 5)` picks a step from `[30,60,120,300,600,900,1200,1800,3600]` s and labels with `formatTimeShort` (H:MM). Round minutes only.
- **y**: `count` → 4 integer ticks; `percent` → each bin count divided by that series' full filtered `n`, with ticks formatted `5%`. Gridlines in `--grid` at each tick, baseline only (no left spine, no tick marks). Add `timeTicks`, `ordinal(n)` ("42nd"), `DISTANCES`, and `formatPace` to `shared.js`.
- **Outline** (the only style, A4 / C2): one `<path>` per series stepping along bin tops, stroke 1.5px in the series colour, fill the same colour at 0.18, drawn in series order. Per-bin hover: invisible full-height `<rect>`s; on hover draw a solid rect (series colour at 0.35) beneath the path for that bin and show the tooltip. Single series: time range, pace range, count, percentile range (as today). Two series: one line per race, e.g. `North Carolina 142 (8%) · New York 61 (3%)`.
- **Pace** (`shared.js`): `const DISTANCES = { swim: { m: 1900 }, bike: { mi: 56 }, run: { mi: 13.1 } }`. `formatPace('swim', s)` → `2:19/100m` (s / 19 seconds per 100 m); `formatPace('bike', s)` → `18.4 mph` (56 / (s / 3600), one decimal); `formatPace('run', s)` → `8:35/mi` (s / 13.1). Returns `null` for t1, t2, finish, and callers skip the span. Imperial only; write it so a metric variant is a small later addition, but do not build a unit toggle now.
- **Quartile markers**: `<line class="quartile-line">` full height, `stroke-dasharray 1 3`, colour `--quartile`. IQR band: `<rect>` behind the bars in the series colour at `--iqr-opacity`. **No text in the SVG.** Each line gets a 10px-wide transparent hit line whose tooltip reads "25th percentile · 0:39 · 2:04/100m".
- **Athlete marker**: `<line class="athlete-marker">` 2px solid `--marker` from `y=-4` to the baseline plus an 8×6 downward triangle at the top; hover tooltip "Erin Mcguinness · 0:44 · 2:21/100m · 42% percentile in F35-39". No text in the SVG.
- **Median lines** (compare): 1.5px, `stroke-dasharray 4 3`, series colour, full height, no text.
- **Edge cases**:
  - Empty single series: render no SVG distribution and let the page show its empty-state message.
  - One-value or zero-width domain: center one bin on the value using the smallest appropriate snapped width; all three quartiles are that value.
  - One empty comparison series: render the nonempty series normally and mark the empty series "No data" in the legend/header instead of blanking the whole card.
  - Empty bins remain in both comparison series so their paths share identical x coordinates.
- Return the stats so the page can render the header.

Card structure the pages render (the module only touches the `<svg>`):
```html
<div class="chart-container" id="swim-chart">
  <div class="chart-head">
    <h3>Swim</h3>
    <div class="chart-stats"><span><b>25%</b> 0:39 <i class="pace">2:04/100m</i></span><span><b>50%</b> 0:44 <i class="pace">2:19/100m</i></span><span><b>75%</b> 0:49 <i class="pace">2:37/100m</i></span></div>
  </div>
  <div class="chart-sub"><!-- athlete chip, or compare "typically faster" note --></div>
  <svg …></svg>
</div>
```

### WS4 — Single race page (`index.html`, `js/app.js`)

- Replace `drawHistogram` with `renderHistogram(card, { series:[{id:'a', values, color:'var(--swim)'}], style:'outline', yMode:'count', markers:{ quartiles:true, band:true, athlete } })` and render `.chart-stats` from the returned quartiles.
- Athlete chip in `.chart-sub`: `Erin Mcguinness · 0:44 · 2:21/100m · 42% percentile in F35-39`, `--chip` = the split colour. Percentiles on this page are relative to the current division filter, whereas the athlete index behind Athlete Search is race-wide, so the chip names the group. Keep the current behaviour of switching the division to the athlete's age group, and add the division to the toolbar count ("55 athletes · F35-39").
- Call `drawCharts()` once at the end of init instead of three times.
- Loading: set the count to "Loading…" as now; optionally give cards a `.is-loading` state (reduced opacity) instead of removing the SVGs.
- Empty state text: "No data for this division".
- Set page title / document.title per WS1.

### WS5 — Compare page (`compare.html`, `js/compare.js`)

- Controls: keep the A / B grouping but style each as a small card with a `.race-dot` in `--race-a` / `--race-b` before the label; the division group gets the same card style. Below the toolbar add a legend line that reflects the current division filter and re-renders when it changes: `● North Carolina 2025 · 1,810 athletes   ● New York 2025 · 2,206 athletes`, or with a division selected `● North Carolina 2025 · 212 athletes in M40-44   ● New York 2025 · 251 athletes in M40-44`. This is where the absolute numbers live, since the y-axis is percent.
- Charts: `renderHistogram(card, { series:[A, B], style:'outline', yMode:'percent', medians:true })`. `.chart-stats` shows both medians with coloured dots and pace (`● 0:32 1:41/100m · ● 0:44 2:19/100m`); `.chart-sub` keeps the "North Carolina typically 11:16 faster" sentence in the winning colour. Add `formatDelta(seconds)` to `shared.js` that drops a leading "0:" hour.
- Delete `updateStats()`; keep URL handling unchanged.

### WS6 — Tables, athlete, predictor

- **Race List**: `th.num`/`td.num` on all time columns; "# Years" → "Years"; external-link icon inline SVG; description line becomes "Showing 50th percentile (median) split times" next to the control rather than a separate paragraph.
- **Athlete Search**: add T1 and T2 columns; use `loadRaces()` names instead of capitalised ids; make the results dropdown float over the page (position absolute, like `predict.html`) so the table doesn't jump; move "Predict race time →" from a table footer row to a button beside the athlete name.
- **Predictor**: two-column layout ≥ 820px. Left card "Percentile profile": five rows of `label · number input · range slider (1–99)` kept in sync. Right card "Projection": big finish time (2rem, tabular), "≈ 24th percentile at New York 2025", then a compact five-row split list. Stack on mobile. No logic changes.

### WS7 — Responsive and accessibility

- `.tabs { overflow-x:auto; white-space:nowrap; scrollbar-width:none }` on narrow screens; tabs never wrap.
- `.container` padding 1rem under 600px; toolbar fields stretch to full width under 480px.
- `:focus-visible` ring on links, buttons, inputs, Choices; `aria-current` on the active tab; `role="img"` + `aria-label="Swim histogram, median 0:44"` on each SVG.
- `@media (prefers-reduced-motion: reduce)` disables transitions.

---

## 4. Suggested PR sequence

1. **PR 1 — chrome, theme, tokens** (WS1, WS2). Mechanical but touches every page; establishes the visual baseline. No chart changes.
2. **Before PR 2 — integrated mockup check.** Add a final-state section to the companion mockup showing the actual combined treatment: outline + fill, IQR band, header quartiles with pace, athlete chip/marker, and trimmed-domain note. Render it at 1280px and 390px in both themes; adjust wrapping before implementing the shared renderer.
3. **PR 2 — histogram module + single race** (WS3, WS4). The core of the request.
4. **PR 3 — compare on the module** (WS5). Deletes the second histogram implementation.
5. **PR 4 — tables/athlete/predictor + responsive/a11y sweep** (WS6, WS7).

Each PR should include screenshots at 1280px and 390px in both themes. `npm start` serves the site on port 8080; a headless Chromium `--screenshot` run against `http://localhost:8080/…` is enough.

---

## 5. Acceptance checklist

- `index.html?race=new-york&year=2025&athlete=Erin%20Mcguinness` — no overlapping text in any card; T1 and T2 cards readable; chip reads `Erin Mcguinness · 0:44 · 2:21/100m · 42% percentile in F35-39` on Swim; quartiles in the header with pace (median 0:44 → 2:19/100m; Bike median 3:02 → 18.4 mph).
- `index.html?race=new-york&year=2025&division=F35-39` — 12–14 bins, no one-pixel bars, gridlines visible.
- `index.html?race=new-york&year=2025` — 40 bins, outline + light fill, IQR band visible, hovering a bin fills it and shows the tooltip, x ticks on round minutes (0:30, 0:45, 1:00…). T1, T2, and Overall cards show no pace.
- T1/T2 long-tail check — the main distribution is not compressed by a handful of extreme transitions; any trimmed observations are counted in a visible "outside view" note, while quartiles and percentages still reflect the full valid sample.
- `compare.html?race_a=north-carolina&year_a=2025&race_b=new-york&year_b=2025` — both outlines legible where they overlap; y-axis in %; legend shows both athlete counts and updates when the division changes; Bike medians 3:02 / 3:03 both readable in the header with pace; hovering a bin lists both races with count and percent.
- `compare.html?race_a=agadir&year_a=2025&race_b=new-york&year_b=2025` — a 464-finisher race against a 2,206-finisher race still compares by shape.
- `races.html` — every column sorts; times right-aligned.
- `athlete.html?athlete=Jake%20Hofman` — T1/T2 columns present; h1 and document.title show the name; race names match the manifest.
- `predict.html?athlete=Jake%20Hofman&race=new-york&year=2025` — same numbers as before the refactor (finish 5:31:55, ≈24%).
- Reload each page in dark mode: no light/dark flash; preference persists; with no saved preference the OS setting is respected.
- 390px wide: tabs don't wrap, nothing overlaps the content, charts fill the width.
- Sharing any URL from the checklist reproduces the same state (no URL parameter renamed).

---

## 6. Files touched

| File | Change |
|---|---|
| `index.html`, `compare.html`, `races.html`, `athlete.html`, `predict.html` | head bootstrap script, `data-page`, remove nav/h1/subtitle, add `.page-head`, card head/sub markup, drop Font Awesome, add `nav.js` + `histogram.js` script tags |
| `css/style.css` | tokens, theme selector, topbar/tabs/page-head, toolbar, cards, chip, tables, controls, responsive rules |
| `js/nav.js` (new) | top bar + icons |
| `js/theme.js` | toggle wiring only |
| `js/histogram.js` (new) | shared renderer |
| `js/shared.js` | `timeTicks`, `ordinal`, `formatDelta`, `DISTANCES`, `formatPace`, `setPageTitle` |
| `js/app.js`, `js/compare.js` | use the module, render headers/chips, remove old draw functions |
| `js/races.js`, `js/athlete-lookup.js`, `js/predict.js` | WS6 |
| `README.md` | update screenshots and the project-structure list |

---

## 7. Decision log (Jake, 2026-09-06)

- Bars: **A4** outline + light fill, on both pages.
- Labels: **B2**, numbers in the card header, plus pace next to each time.
- Palette: harmonised per-split hues (P row 2).
- Chrome: **D**.
- Compare y-axis: percent of finishers, no count toggle; absolute counts in the legend under the toolbar (follows the division filter) and in bin tooltips.
- Athlete marker: neutral text colour.
- Icons: drop Font Awesome for inline SVGs.
- Pace distances: swim 1,900 m, bike 56 mi, run 13.1 mi. Pace is nominal; courses vary a little.
- Units: imperial only (min/100m, mph, min/mi). No toggle; keep the formatter easy to extend.
