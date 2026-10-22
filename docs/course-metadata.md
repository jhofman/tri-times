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

Every race with a live official page has a profile: the race page's swim type,
bike/run terrain, and typical air/water temperatures. `npm run
fetch-course-conditions` refreshes these for every race in `results/races.json`,
adding races without metadata by trying their `im703-<id>` page (with a small
alias table for renamed slugs). Retired races whose page is missing or
redirects are skipped, as are World Championships, whose venue rotates each
year. The script logs every change. Edition facts (elevation, transitions,
features, guide links) are curated by hand for a subset of races.

Typical temperatures are climate/profile values, not race-day weather.

## Observed from results

`npm run update-manifest` generates `results/course-observations.json` from
race-year split medians. Only race-years with at least 200 finishers count, and
a split is used only when at least 90% of finishers have it. Two kinds of
signal are written:

**Across races (`courses[race].signals`)** describe the course, so they are
the same in every year. A race's typical split is the median of its eligible
race-year medians, skipping any year where that leg looks shortened (see below).
That value is ranked against every other race, and a signal is emitted in the
fastest or slowest 10%. The UI words these as "Slow course" (in the leg box) or
"Long T1 setup" with a bolt (fast) or hourglass (slow) icon, adding "Very" in the
extreme 3% tail.

**Within a race (`races[race][year].yearSignals`)** compare a race-year with
the median of the same race's other eligible years (at least 3). A signal is emitted when the gap is at
least 5% and 60 seconds for swim/bike/run, or 15% and 30 seconds for
transitions. The UI shows these as a note beside the split's chart ("11 min
slower than usual in 2026") with an up/down arrow, and draws a dashed "usual"
line at the typical median. Because they use all finishers, the notes and line
are hidden when a division is selected. A leg at least 25% faster than usual (detectable with only 2
other years) is flagged `likelyShortened` and shown as "Much faster than
usual in 2023" with a warning icon, and that year is left out of the race's
typical value for that split.

These signals are descriptive, not causal. Field strength, weather, course
changes, and timing quality can all affect result distributions, so the UI
labels them with explanatory tooltips and never presents them as official
course facts. Swim/bike/run course signals appear as dashed chips in the leg
boxes; transition signals appear beside the T1/T2 charts. World Championship
results are excluded because their venue rotates. Only emitted signals are
written to the frontend artifact.
