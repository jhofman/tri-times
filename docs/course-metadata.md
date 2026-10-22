# Course metadata

`results/course-metadata.json` contains small, curated course profiles for the
Single Race page. It is intentionally separate from generated result
statistics so official facts and result-derived observations are not mixed.

## Curated official facts

Each race can include:

- a broad swim type and bike/run terrain profile;
- typical air and water temperatures published on the official race page;
- edition-specific elevation gain, lap counts, transition arrangements, and
  notable course features;
- links to the official race page and the athlete guide or course map used.

Edition-specific facts must identify a source in the same race entry. Preserve
missing fields by omitting them; do not infer values from another race or
edition. Guide PDFs are linked rather than committed. When the selected result
year has no matching guide, the card's title tooltip names the year of the
latest available official course details and warns that routes can change.

Typical temperatures are climate/profile values, not race-day weather. Refresh
them from the official race pages with `npm run fetch-course-conditions`; the
script updates only temperatures and reports where curated swim/bike/run labels
differ from the race page.

## Observed from results

`npm run update-manifest` generates `results/course-observations.json` from
race-year split medians. Only race-years with at least 200 finishers count, and
a split is used only when at least 90% of finishers have it. Two kinds of
signal are written:

**Across races (`signals`)** compare a race-year's median with every eligible
70.3 race-year. A signal is emitted when it falls in the fastest or slowest 10%.
These mostly describe the course, so the UI words them as "Slow bike course" or
"Long T1 setup" with a bolt (fast) or hourglass (slow) icon, adding "Very" in
the extreme 3% tail.

**Within a race (`yearSignals`)** compare a race-year with the median of the same
race's other eligible years (at least 3). A signal is emitted when the gap is at
least 5% and 60 seconds for swim/bike/run, or 15% and 30 seconds for
transitions. The UI words these as "2026 swim 11 min slower than usual" with an
up/down arrow. A leg at least 25% faster than usual (detectable with only 2
other years) is flagged `likelyShortened` and shown as "2023 swim much faster
than usual" with a warning icon; the across-race chip for that split is then
suppressed, since it reflects the shortened course rather than the venue.

These signals are descriptive, not causal. Field strength, weather, course
changes, and timing quality can all affect result distributions, so the UI
shows them as dashed chips with explanatory tooltips and never presents them as
official course facts. Only emitted signals are written to the frontend
artifact (about 22 KB gzipped).
