# MPVRP-CC site

The React/TypeScript GitHub Pages application lives here. Run `npm ci`, then `npm run dev` for local development or `npm run build` for production. The output is `dist/`. Build with `PAGES_BASE=/MPVRP-CC/` for the project Pages URL.

`src/main.tsx` defines the text-led pages and leaderboard view. `src/leaderboard.ts` ranks accepted runs from `leaderboard/runs.json`. `src/scoring/` holds the official parser and feasibility checks. `scripts/score-submission.ts` scores untrusted ZIP files; `scripts/evaluate-contribution.ts` validates the two-file pull-request format; `scripts/publish-result.ts` appends an accepted report. `scripts/prepare-assets.mjs` generates `public/` and the selected-example manifest from repository sources. The visualizer source remains in `pages/` and is copied into the build.

Run `npm run check:references` after any scorer or benchmark change and `npm run check:leaderboard` after leaderboard logic changes. The official scoring contract is in `../docs/scoring-v1.md`.
