# GitHub Pages migration plan

Updated: 2026-09-30

## Goal and boundaries

Publish the MPVRP-CC research site with GitHub Pages and GitHub Actions, without an always-on server. Keep the benchmark, downloadable Python startup kit, interactive visualizer, examples, official scoring, and a public leaderboard. Remove the hosted FastAPI service after its replacement is verified. The published site must contain no Notion token, GitHub write token, participant email address, or other secret.

This file is the progress tracker. Status markers: `[ ]` planned, `[~]` in progress, `[x]` complete, `[?]` awaiting a decision. Each phase has a review point before the next major implementation phase.

## Proposed architecture

```text
GitHub Pages: React + TypeScript static site
  Home / About / Examples / Visualizer / Submit and Leaderboard
  Public assets: benchmark ZIPs, example images and files, startup kit
  Read-only leaderboard: generated JSON, with complete and partial tables

GitHub Actions: build and publish the site; score submitted solution ZIPs
  Scoring core: TypeScript CLI shared with optional browser-side local checks
  Untrusted submissions: parsed as data, never executed as code
  Publication: trusted maintainer review, then update versioned leaderboard JSON
```

Submissions will use GitHub pull requests containing a ZIP and basic team metadata. A pull-request workflow evaluates it **without secrets or write permissions** and reports a result. A maintainer reviews the submission and publishes accepted results through a trusted workflow. This gives public, reproducible scoring, but requires a GitHub account and does not provide the current instant web upload. Submission ZIPs remain in pull request branches; only reviewed result metadata and provenance enter the main branch and deployed leaderboard.

The owner chose to remove Notion. The versioned `leaderboard/runs.json` is the sole public source of truth.

## Phase 0 — audit and agree on the scoring contract

- [x] Inventory the current site, API-dependent features, data, workflows, and uncommitted work.
- [x] Record the exact official scoring and leaderboard rules, including file naming, missing solutions, ties, and score replacement behavior. ZIP size limits remain a Phase 3 implementation detail.
- [x] Resolve conflicting documented and implemented penalties by superseding both with the versioned normalized scoring specification in `docs/scoring-v1.md`.
- [x] Freeze 100 feasible reference objectives and source hashes in `data/reference_scores.v1.json`; add a regression check before changing implementations.
- [x] Owner reviewed and accepted the scoring specification. Notion retention and startup kit contents can be decided in later phases.

**Exit check:** the scoring specification and expected results are approved, and the old scorer is a reliable reference for the new one.

### Findings so far

- The current static site is at `index.html` and `pages/`; the canvas visualizer loads local example files.
- FastAPI provides generator, single-solution verifier, ZIP scorer, and leaderboard endpoints. Existing pages call these endpoints.
- The official benchmark has 100 cost-bearing instances and 100 zero-cost counterparts. ZIP files may contain a subset; each missing or invalid official solution is penalized.
- `README.md` and `docs/solution_format.md` state a penalty of **100,000** per instance, while `backend/core/scoring/score_evaluation.py` currently uses **100,000,000**. This must be resolved before migration.
- The current Notion code overwrites a participant record by email on each submission and recalculates ranks. That may replace a better score with a worse score; the desired policy needs confirmation.
- Current ranking sorts by ascending score, then earlier submission date, and assigns consecutive ranks even when scores are equal.
- The owner chose GitHub pull requests for submissions. The leaderboard should retain each team's best result by default and offer a way to display its latest result; whether this changes rank or only the displayed run remains to be specified.
- Raw objective sums give greater weight to costly instances. The owner has now supplied 100 reference solutions in each of `data/solutions/in/` and `data/solutions/out/`, paired with 100 instances in each corresponding `data/instances/` directory. The `in` instances have changeover costs and are the official set; `out` instances have zero costs.
- Read-only verification with the existing parser and feasibility checker found all 100 `in` pairs feasible and all 100 `out` pairs feasible. Recomputed objectives match the totals reported in all 200 solution files. Official `in` reference objectives range from 3,571 to 257,940, with median 19,512.
- The owner also reorganized `data/instances/`, leaving the old tracked paths deleted and new `in/` and `out/` paths untracked. This work must be preserved and coordinated with the code migration.
- The owner requested two leaderboard tables: complete submissions and partial submissions. Submission metadata will include an optional free-text `Method` field (for example, heuristic, CP, LP, or ML).

### Proposed scoring contract for review

- For every feasible official instance `i`, recompute `C_i = distance_i + changeover_i` from the submitted route. Do not trust the summary printed in its solution file.
- Recompute and freeze reference objective `R_i > 0` from the feasible `data/solutions/in/` solution paired with the official cost-bearing instance. Publish the 100 values and a scoring-version identifier. These are reference solutions, not claimed optima.
- Define the per-instance gap as `g_i = 100 * (C_i - R_i) / R_i` percentage points. Lower is better. A negative gap is a valid improvement on the reference.
- A **complete** run has 100 feasible official solutions. Its official score is the arithmetic mean of its 100 `g_i` values. Rank complete runs by this score, ascending.
- A **partial** run has 0–99 feasible official solutions, even if its ZIP contains 100 files with one or more invalid solutions. Show feasible count and the mean `g_i` across feasible instances. Missing and invalid instances have no fabricated objective or fixed penalty.
- Proposed partial-table order: feasible count descending, then mean gap ascending among runs with the same feasible count. This is a progress order, not an official cross-subset quality claim: teams with the same count may have solved different instances. Runs with zero feasible instances have no mean gap and sort last.
- Proposed team placement: once a team has a complete run, its best complete run determines its position in the complete table; otherwise its best partial run determines its position in the partial table. A user-selectable latest-run view shows the newest run alongside the best ranked run without changing rank. `Method` belongs to a run, so the best and latest runs may display different methods.
- `Method` is optional submission metadata and a public column or detail. Its value is descriptive and must not affect feasibility, scoring, or rank. Limit length and escape it when rendered.
- The existing GitHub Pages workflow publishes the repository root and injects an API URL. The new workflow should publish only the built site.
- Existing uncommitted changes in `pyproject.toml`, `uv.lock`, `src/`, and `pages/static/imgs/logos/` belong to the current workspace and must be preserved.

## Phase 1 — site structure and content

- [x] Create a Vite React + TypeScript frontend with explicit hash routes and GitHub Pages base-path handling.
- [x] Draft a text-led homepage: problem introduction, research status, available toolkit, benchmark downloads, documentation placeholder, and call for applied partnerships or sponsored competitions.
- [~] Draft an About page with project context and existing public contacts; owner copy review remains.
- [~] Add a configurable published Google Docs URL field; owner chose a temporary placeholder until the URL is ready. Keep a versioned scoring specification in this repository.
- [x] Add an Examples page driven by `images/selected_solution_images.txt`. All 20 selected cost-bearing pairs have matching instance and CP solution plots plus downloadable `.dat` files.
- [x] Preserve both benchmark ZIP downloads and link the newly supplied `mpvrp-cc-startup.zip` from the homepage.
- [~] Check mobile layout, keyboard navigation, image descriptions, broken links, and base-path behavior. Desktop and mobile screenshots were visually inspected; link and keyboard checks remain.

**Review point:** owner reviews page structure and copy before the submission interface is finalized.

## Phase 2 — visualizer and local tools

- [x] Package the existing visualizer as a full-screen static tool reachable from the React site, preserving its file import, example loading, and canvas controls. A later TypeScript rewrite is optional; the tool needs no backend.
- [ ] Decide whether the browser should offer local single-solution verification and instance generation. Port only features that will remain public; describe unsupported functions honestly.
- [x] Keep generated/example files under static public assets with stable URLs.
- [~] Verify visualizer behavior using an existing paired instance and solution. The bundled files and selected plot return HTTP 200, and the visualizer renders; interactive load/play checks remain.

**Review point:** owner checks the visualizer and chooses which local tools belong on the simplified site.

## Phase 3 — official scorer and submissions

- [x] Port the official instance and solution parsers, feasibility checks, and ZIP scorer to TypeScript. Preserve the approved scoring contract, including changeover costs and all 100 instance checks.
- [~] Add fixture-based parity checks against the old Python implementation, plus malformed ZIP and path-safety cases. The 100 reference pairs match exactly; manual ZIP checks cover complete, partial, duplicate, and traversal cases. Automated ZIP regression checks remain.
- [x] Implement GitHub pull-request submissions and a read-only, secret-free evaluation workflow. Set strict file count and extracted-size limits. Do not run participant scripts or PR-modified workflow code with secrets.
- [x] Produce a machine-readable scoring report and a reviewer-friendly summary for each submission.
- [x] Create a trusted publication step that updates a versioned leaderboard dataset only after review.
- [~] Document identity, replacement, tie, and dispute rules in public-facing language.
- [x] Capture optional `Method` metadata in pull-request submissions and publish it with the accepted run.

**Review point:** owner tries a sample submission and approves the publication flow.

## Phase 4 — leaderboard and optional Notion integration

- [x] Render separate complete and partial leaderboard tables from generated JSON with visible update time and scoring version. Show the best ranked run and an optional latest-run view.
- [x] Keep private contact details separate from public team names and scores.
- [x] Remove Notion code and credentials; repository JSON is the source of truth.
- [~] Check empty leaderboard, ties, replacement behavior, and malformed data.

**Review point:** owner reviews the public fields and ranking policy.

## Phase 5 — deployment, cleanup, and handover

- [x] Replace the current Pages deployment workflow with a build-and-publish workflow that uploads only the Vite output.
- [ ] Confirm Pages repository/project URL handling, direct route reloads, downloads, and cache behavior.
- [x] Remove FastAPI app, Python backend dependencies, API configuration, Docker setup, and obsolete Python tests after TypeScript parity checks pass.
- [x] Preserve the participant Python startup kit as a download and clearly separate package.
- [x] Update README with local development, scoring, submission, publishing, and maintenance instructions.
- [~] Run build, tests, link checks, and a final GitHub Pages smoke test. Local build, reference parity, leaderboard ordering, selected-image generation, and startup ZIP integrity pass; live deployment remains.

**Exit check:** every published path works without the former server, an accepted sample submission reaches the leaderboard, and the repository documents routine maintenance.

## Decisions needed before Phase 3

1. **Penalty:** proposed: remove fixed penalties. Separate complete and partial tables make missing or invalid instances affect feasible count instead. Recalculate existing scores under the new scoring version.
2. **Submission channel:** decided: GitHub pull requests. Set a repository size/retention policy for ZIPs.
3. **Leaderboard replacement:** decided: retain best result for official rank; the latest-result choice changes only which result is displayed alongside the best ranked run. Decide how equal scores are ranked.
4. **Identity and privacy:** public team name only, and where should private contact email be collected, if at all?
5. **Notion:** decided: remove it completely.
6. **Materials:** selected example pairs and startup ZIP supplied. Published Google Docs URL and any additional public team/contact copy remain placeholders.

## Progress log

- **2026-09-30:** Plan created. Repository inventory complete. Phase 0 scoring audit started; penalty conflict and current score-replacement behavior identified. No backend or deployment files removed.
- **2026-09-30:** Owner selected pull-request submissions and best-result default with latest-result display option. Scoring design discussion opened because instance objective scales differ substantially.
- **2026-09-30:** Owner supplied 200 reference solutions. All 100 official cost-bearing pairs and all 100 zero-cost pairs pass the existing feasibility checker, and all reported objectives match recomputed objectives. Best run remains the ranking basis; latest run is a display option.
- **2026-09-30:** Owner requested separate complete and partial leaderboard tables plus optional `Method` metadata. A normalized scoring contract and partial progress ordering were drafted and accepted.
- **2026-09-30:** Added `docs/scoring-v1.md` and a manifest of 100 recomputed official reference objectives with source hashes. Updated temporary Python instance paths for the owner's `in/` and `out/` reorganization. Added a reference integrity regression test; 8 relevant tests pass. Phase 0 is ready for owner review.
- **2026-09-30:** Owner accepted the scoring specification. Created `web/` with Vite, React, TypeScript, text-led Home/About/Examples/Submit drafts, configurable content links, and copied public benchmark/example assets. Production build passes. Owner chose temporary placeholders for Google Docs and the startup kit. Existing Pages deployment remains unchanged until the visualizer and leaderboard are ready. Phase 1 copy and structure are ready for owner review; visual layout inspection remains open.
- **2026-09-30:** Owner requested a simpler academic visual style. Replaced the warm colors, cards, and button treatments with a white page, black text, conventional blue links, plain sections, and an 800 px reading column with side margins. The production build passes after the style change.
- **2026-09-30:** Owner requested Inter and Space Grotesk and fuller academic content modeled on the structure of the DIMACS split-deliveries benchmark page. Reworked the React pages into a research brief with problem statement, evaluation, instances, formats, submission guidance, and organizers. Updated old documentation text to point to scoring version 1.0.0; the former Python API remains explicitly identified as legacy. Production build passes.
- **2026-09-30:** Captured and inspected desktop (1280 px) and mobile (390 px) previews of the new overview. The reading column, headings, navigation, and paragraphs fit both widths without horizontal clipping.
- **2026-09-30:** Owner requested larger type and Bulma. Installed Bulma, increased body text to 18 px on desktop and 17 px on narrow screens, rebuilt the navigation with Bulma's responsive navbar and a React-controlled mobile menu, and added restrained blue accents and download buttons. Production build passes; desktop and mobile previews were visually inspected.
- **2026-09-30:** Integrated all 20 plot pairs selected in `images/selected_solution_images.txt` with matching official `.dat` downloads. Packaged the canvas visualizer under the built site's `/visualizer/` path and linked it from React. Build and page previews pass; bundled example and selected plot URLs return HTTP 200.
- **2026-09-30:** Ported parsing, feasibility, and normalized ZIP scoring to TypeScript. All 100 official reference solutions reproduce the Python results exactly; a full reference ZIP scores 100/100 at 0%, a one-solution ZIP scores 1/100 at 0%, duplicates count as invalid, and a traversal path is rejected. ZIP handling streams files with compressed, extracted, entry-count, and per-solution limits.

- **2026-09-30:** Owner chose to remove Notion. Linked the supplied startup ZIP, removed the FastAPI/Notion backend and obsolete API pages, reduced the Python project to local startup-tool dependencies, and updated README. React production build passes and includes the starter ZIP. The Pages workflows are prepared but require a repository push and live Pages smoke test.
- **2026-09-30:** Final local checks after cleanup: 100 TypeScript reference checks match the frozen Python values, leaderboard ordering and best/latest selection pass, the production build succeeds, and the startup ZIP passes its archive integrity check. Publishing requires committing source assets and workflows, selecting GitHub Actions as the Pages source, then checking the live site.
