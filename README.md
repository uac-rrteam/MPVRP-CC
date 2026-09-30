# MPVRP-CC

A research benchmark for the **Multi-Product Vehicle Routing Problem with Split Deliveries and Changeover Costs**. The site is a static React and TypeScript application published by GitHub Pages. GitHub Actions checks pull-request submissions and publishes accepted leaderboard results. No running server or Notion database is required.

## Benchmark and scoring

`data/instances/in/` contains the 100 official instances with changeover costs; `data/instances/out/` contains matched zero-cost variants. Reference solutions are in `data/solutions/in/` and `data/solutions/out/`. Downloadable benchmark ZIPs are in `data/zips/`. The official scorer uses the 100 `in/` instances and frozen reference objectives in `data/reference_scores.v1.json`.

A feasible solution is scored by its recomputed distance plus changeover cost. Each official instance receives a percentage gap from its reference. Complete runs (100 feasible solutions) are ranked by mean gap. Partial runs appear in a separate table, ordered by feasible count and then mean gap. Each team's best run sets its rank; the site can also display its latest run. See [scoring rules](docs/scoring-v1.md), [problem statement](docs/problem.md), [instance format](docs/instance_format.md), and [solution format](docs/solution_format.md).

## Site development

Requires Node.js 24 and npm.

```bash
cd web
npm ci
npm run dev
```

`npm run build` produces `web/dist/`. For the project Pages URL, build with `PAGES_BASE=/MPVRP-CC/ npm run build`. The React routes use URL hashes; the visualizer is a standalone static page at `/visualizer/` within the Pages base path. `web/scripts/prepare-assets.mjs` copies the selected plot pairs from `images/selected_solution_images.txt`, matching `.dat` downloads, benchmark ZIPs, the startup ZIP, and leaderboard JSON into generated public assets. Commit these source assets when updating the site; do not edit `web/public/` directly.

Set the published Google Docs URL in `web/src/config.ts` when it is ready. Until then, the site shows a documentation placeholder. The Python startup kit is available as `mpvrp-cc-startup.zip` and on the homepage.

## Submissions and publication

Read [SUBMITTING.md](SUBMITTING.md) to create a pull request containing only `submission.json` and `solutions.zip` under `submissions/GITHUB_LOGIN/RUN_ID/`. The read-only `score-submission.yml` workflow checks it using trusted code from the base branch and uploads a JSON report. A maintainer reviews the result, then runs the **Publish accepted submission** workflow with the pull request number. That workflow rechecks the submission, appends a public run to `leaderboard/runs.json`, commits it to `main`, builds the site, and deploys it. Submitted ZIPs remain in the pull request branch and are not copied to Pages.

To check the official references and leaderboard locally:

```bash
cd web
npm run check:references
npm run check:leaderboard
npm run build
```

Repository maintainers must select **GitHub Actions** as the Pages build source in repository settings. The `deploy.yml` workflow builds and deploys on pushes to `main`. A custom-domain root deployment requires changing `PAGES_BASE` in both deployment workflows to `/`.

## Local Python tools

`src/mpvrp/` and `src/tools/` are local participant and benchmark tools, separate from the site. They are also packaged in `mpvrp-cc-startup.zip`. Python 3.12 and `uv sync` install their dependencies. The Python checker is a local convenience; the TypeScript GitHub Action is authoritative for public submissions.

## Repository map

- `web/`: React site, TypeScript scorer, asset preparation scripts.
- `images/plots/`: example instance and solution plots selected by `images/selected_solution_images.txt`.
- `data/`: benchmark instances, reference solutions and objectives, download ZIPs.
- `leaderboard/runs.json`: versioned public accepted-run history.
- `.github/workflows/`: read-only PR scoring, trusted publication, and Pages deployment.
- `src/`: local Python startup tools.
- `MIGRATION_PLAN.md`: migration decisions and progress.

## License

See [LICENSE](LICENSE).
