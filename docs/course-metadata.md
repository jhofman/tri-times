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
year has no matching guide, the UI labels the year of the latest available
official course details and warns that routes can change.

Typical temperatures are climate/profile values, not race-day weather.

## Observed from results

`npm run update-manifest` generates `results/course-observations.json`. For each
race-year it computes split medians and compares them with other race-year
medians. A fast or slow signal is emitted only when:

- the race-year has at least 200 finishers;
- at least 90% of finishers have that split; and
- the median falls in the fastest or slowest 10% of eligible race-years.

These signals are descriptive, not causal. Field strength, weather, course
changes, and timing quality can all affect result distributions. The UI
therefore shows them as dashed chips ("Fast swim", "Very long T1") with a
bolt or hourglass icon, explains them in a caption and tooltip, and does
not turn a fast swim or long transition into an official course claim.
Chips use "Very" when a race-year falls in the extreme 3% tail.
Only emitted tail signals are written to the frontend artifact, keeping the
additional page payload small.
