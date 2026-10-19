# Data storage and repository growth

The app currently serves raw race-year CSVs and generated manifests and athlete
indexes directly from GitHub Pages. This keeps deployment simple and supports
lazy client-side loading, but historical imports increase both the published
site and Git history.

## Current baseline

As of October 19, 2026:

- `results/` contains roughly 516 MB of uncompressed data after the Atlantic
  City and recent North American historical imports.
- Raw CSV files account for roughly 375 MB.
- Generated athlete and search indexes account for roughly 141 MB.
- The largest tracked file is roughly 13 MB.
- The published GitHub Pages artifact is roughly 150 MB compressed.

The 13-event North American cohort increased `results/` by only about 6 MB, but
it touched 365 files because athlete records are distributed across generated
index shards. This is why batching imports and regenerating once matters more
than keeping each individual batch extremely small.

GitHub Pages limits a published site to 1 GB. GitHub warns when a normal Git
file exceeds 50 MiB and blocks files larger than 100 MiB. Current files are
comfortably below the per-file limit, but a comprehensive historical import can
move the total site meaningfully closer to the Pages limit.

References:

- https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits
- https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github

## Import strategy

Historical imports should be prepared as a batch:

1. Add event UUIDs to `historical-races.json`.
2. Run `npm run fetch-historical-results`.
3. Validate all new CSVs.
4. Run `npm run update-manifest` once.
5. Commit the raw and generated data together.

The generated athlete indexes rewrite many shards. Regenerating and committing
them after every individual race creates unnecessary repository history and
very large pull request diffs. Local exploratory imports should not regenerate
or commit derived indexes until the selected batch is final.

## When the current model stops scaling

Revisit storage before the published site reaches roughly 800–900 MB or before
generated index churn makes routine data pull requests difficult to review.
Likely next steps, in increasing order of complexity:

1. Split large athlete shards into smaller stable partitions to reduce rewritten
   blobs when new results are added.
2. Generate derived data deterministically during deployment rather than storing
   every generated artifact in Git.
3. Store raw historical CSVs in release assets or object storage and keep only
   manifests and compact summaries in the Pages repository.
4. Move athlete lookup and large result data behind a small data service if
   static hosting no longer fits the dataset.

Git LFS is not a replacement for this design because GitHub Pages does not serve
LFS objects as ordinary site files.
