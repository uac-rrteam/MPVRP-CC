# MPVRP-CC scoring contract, version 1.0.0

Status: agreed design for the GitHub Pages migration. This version starts a new leaderboard; scores from the former raw-sum system are not directly comparable.

## Official benchmark and references

The official benchmark comprises the 100 cost-bearing instances numbered `001` through `100` under `data/instances/in/`. The zero-cost `out/` set is for comparison and does not affect the leaderboard.

`data/reference_scores.v1.json` fixes a feasible reference objective `R_i` for every official instance. Each value was recomputed as travel distance plus loading and changeover cost from the paired route in `data/solutions/in/`. The manifest records SHA-256 hashes for both source files. These are **reference values, not proven optima**. A valid solution may improve on a reference.

The published scoring version fixes the instances, their interpretation, reference values, and ranking formula. A later correction requires a new version and a recalculation of affected runs. The website must show the version used for each result.

## Feasibility and objective

For each recognized submitted solution, parse its route and validate every structural and operational rule in the instance and solution format specifications. Recompute, without trusting the summary lines in the solution file:

```text
C_i = total travel distance + total loading/changeover cost
```

Every loading operation incurs its directed matrix cost, including the first loading and same-product loading. A file that is absent, unreadable, duplicated for an instance, or infeasible produces no `C_i` and does not count as feasible. Preserve clear per-instance errors for the submitter.

## Normalized quality

For each feasible instance `i`, calculate its percentage gap from the fixed reference:

```text
g_i = 100 × (C_i − R_i) / R_i
```

Lower is better. `0` matches the reference, `-10` improves it by 10%, and `+10` costs 10% more. Calculate with unrounded objectives and gaps; round only for display. The raw `C_i` and `R_i` remain available in the scoring report.

## Complete table

A run is **complete** when all 100 official instances have feasible solutions. Its official score is the arithmetic mean of its 100 gaps:

```text
complete_score = (g_001 + … + g_100) / 100
```

Rank complete runs by ascending score. For each team, rank its best accepted complete run. Equal unrounded scores are ordered by the earlier acceptance timestamp, then by immutable submission ID; the displayed rank is unique and consecutive. Show the score with a `%` sign and label it “average gap to reference.”

## Partial table

A run with fewer than 100 feasible official solutions is **partial**, even if its ZIP contains 100 candidate files. Show its feasible count and, if at least one instance is feasible, the arithmetic mean of the gaps for those feasible instances. For zero feasible instances, show “—” for mean gap.

For each team without a complete run, retain its best accepted partial run. Order the partial table by feasible count descending, then mean gap ascending, then earlier acceptance timestamp and immutable submission ID. Zero-feasible runs sort last. A partial mean gap is descriptive: teams with the same count may have solved different instance subsets, so it does not claim equal coverage or directly comparable overall quality. No fixed missing-solution penalty is used.

Once a team has an accepted complete run, it appears in the complete table using its best complete run. A later partial run does not move it back to the partial table.

## Submission history and metadata

Submissions arrive through GitHub pull requests. Every accepted run retains its result and provenance. An optional `Method` field describes the approach (for example, heuristic, CP, LP, or ML). It is public metadata for that run, has a documented length limit, and is rendered as plain text. It does not affect feasibility or ranking.

The best run determines rank by default. A visitor may choose to display a team's latest accepted run alongside its ranked run; this display choice does not change rank or table placement. The method shown with each run belongs to that run. Public team names, method descriptions, scores, and submission provenance are separate from any private contact details.

## Submission package limits

Recognized solution names follow `Sol_###*.dat`, matching an official three-digit instance ID. ZIP files may contain a subset of solutions, with paths at any depth. Duplicate candidates for one ID are rejected for that ID. Unsafe archive paths are rejected. The limits are 25 MB compressed, 100 MB total uncompressed, 1,000 ZIP entries, and 2 MB uncompressed for any recognized solution file. Submitted content is never executed.
