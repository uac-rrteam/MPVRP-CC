# Submit a solution run

The GitHub Pages site has no upload server. Use a GitHub pull request to submit a ZIP of solution files. Every pull request is checked by a read-only workflow using the trusted scorer from the base branch. Accepted results are published by a maintainer.

## Package

Create exactly this directory and these two files in your branch:

```text
submissions/YOUR_GITHUB_LOGIN/RUN_ID/
  submission.json
  solutions.zip
```

`RUN_ID` is a short identifier using letters, digits, `_`, or `-` (maximum 50 characters). Your GitHub login in the path must match the pull request author. The pull request must add only these two files; do not change scorer, benchmark, or website files in the same pull request.

`submission.json` contains a public team name and an optional Method description:

```json
{
  "teamName": "Example Research Group",
  "method": "Constraint programming with local search"
}
```

The team name must have 2–80 characters. Method may have up to 100 characters. Both fields are public and describe this run. Do not include private email addresses. A team is identified by the pull request author's GitHub login; maintainers review any team-name changes.

`solutions.zip` may contain solutions for any subset of the official instances. Name each `.dat` solution with its official three-digit ID, such as `Sol_097_s9_d4_p2.dat` or `Sol_097.dat`. Files may be inside folders in the ZIP. Duplicate candidates for one ID make that instance invalid.

The ZIP must be at most 25 MB compressed, with at most 1,000 entries and 100 MB uncompressed. Any recognized solution file must be at most 2 MB uncompressed. Unsafe paths are rejected. The scorer treats submitted content strictly as data and never runs participant code.

## Evaluation

The workflow reports feasibility for each official instance and the mean percentage gap from the fixed references. A complete run has 100 feasible instances; other runs enter the partial table. The full rules are in [`docs/scoring-v1.md`](docs/scoring-v1.md). An optional Method label does not affect the result.

After the workflow succeeds, a maintainer checks the report and publishes an accepted run. Pull requests are generally closed after publication rather than merged, so submission ZIPs do not accumulate in the site's Git history. The pull request remains as public provenance for the result.
