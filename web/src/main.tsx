import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Link, NavLink, Route, Routes } from 'react-router-dom';
import { assetUrl, siteConfig } from './config';
import { examples } from './examples';
import { rankTeams, type PublicLeaderboard, type RankedTeam } from './leaderboard';
import 'bulma/css/bulma.min.css';
import './style.css';

const navigation = [
  ['/', 'Overview'],
  ['/examples', 'Examples'],
  ['/visualizer', 'Visualizer'],
  ['/submit', 'Submissions & results'],
  ['/about', 'About'],
] as const;

const sourceLink = (path: string) => `${siteConfig.repositoryUrl}/blob/main/${path}`;

function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <nav className="navbar site-header" role="navigation" aria-label="Main navigation">
      <div className="container nav-container">
        <div className="navbar-brand">
          <Link className="navbar-item brand" to="/" onClick={() => setMenuOpen(false)}>MPVRP–CC</Link>
          <button className={`navbar-burger ${menuOpen ? 'is-active' : ''}`} type="button" aria-label="Toggle navigation" aria-controls="site-menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(value => !value)}>
            <span aria-hidden="true" /><span aria-hidden="true" /><span aria-hidden="true" /><span aria-hidden="true" />
          </button>
        </div>
        <div id="site-menu" className={`navbar-menu ${menuOpen ? 'is-active' : ''}`}>
          <div className="navbar-end">
            {navigation.map(([path, label]) => (
              <NavLink key={path} to={path} end={path === '/'} onClick={() => setMenuOpen(false)} className={({ isActive }) => `navbar-item ${isActive ? 'is-active' : ''}`}>
                {label}
              </NavLink>
            ))}
          </div>
        </div>
      </div>
    </nav>
  );
}

function Footer() {
  return (
    <footer className="site-footer">
      <div className="wrap">
        <p>MPVRP–CC · An open research benchmark for multi-product vehicle routing.</p>
        <p><a href={siteConfig.repositoryUrl}>Source repository</a> · <Link to="/about">Organizers and contact</Link></p>
      </div>
    </footer>
  );
}

function PageHeading({ label, title, children }: { label: string; title: string; children: React.ReactNode }) {
  return <div className="page-heading"><p className="page-label">{label}</p><h1>{title}</h1><p className="page-lead">{children}</p></div>;
}

function DocumentationLink() {
  return siteConfig.documentationUrl
    ? <a href={siteConfig.documentationUrl} target="_blank" rel="noreferrer">Full project documentation ↗</a>
    : <span className="pending-link">Full project documentation: Google Docs link forthcoming</span>;
}

function StartupLink() {
  return siteConfig.startupKitUrl
    ? <a href={siteConfig.startupKitUrl}>Download the Python startup kit</a>
    : <span className="pending-link">Python startup-kit ZIP forthcoming</span>;
}

function Home() {
  return (
    <main className="wrap main-content content">
      <PageHeading label="Research benchmark · Scoring version 1.0.0" title="Multi-Product Vehicle Routing with Split Deliveries and Changeover Costs">
        MPVRP–CC studies how a fleet can deliver several products from depots to customers while accounting for both travel distance and the cost of preparing a vehicle for each load.
      </PageHeading>

      <div className="notification is-link is-light intro-note">
        <strong>At a glance.</strong> The benchmark contains 100 official instances and 100 matched zero-cost variants. We provide instance files, reference solutions, examples, an interactive visualizer, and a public submission process. The project is in an academic research phase.
      </div>

      <nav className="on-page" aria-label="On this page">
        <strong>On this page</strong>
        <a href="#problem">Problem</a><a href="#evaluation">Evaluation</a><a href="#instances">Instances</a>
        <a href="#formats">Files and tools</a><a href="#participation">Participation</a>
      </nav>

      <section id="problem" className="text-section">
        <h2>Problem statement</h2>
        <p>A vehicle begins and ends at its home garage. During a trip it loads one product at a depot, delivers that product to one or more stations, and may then start another trip. Vehicle capacity and depot stock are limited. Every station’s demand for each product must be met in full.</p>
        <p>Demand may be split between vehicles. A vehicle may serve the same station again with another product, but it may visit a particular station for a particular product at most once across its entire schedule. This makes product assignment, load quantities, depot choice, and route order interdependent.</p>
        <p>Each loading operation has a directed preparation cost determined by the vehicle’s previous product configuration and the product it loads next. This includes the first load and repeated loads of the same product. The objective is to minimize <strong>total travel distance + total loading and changeover cost</strong>.</p>
        <p><a href={sourceLink('docs/problem.md')}>Read the detailed problem definition</a></p>
      </section>

      <section id="evaluation" className="text-section">
        <h2>Evaluation and ranking</h2>
        <p>Submitted routes are parsed and independently checked for feasibility. The evaluator recalculates distance and loading costs from the route; values written in the solution summary do not determine the score.</p>
        <p>Instance sizes and costs vary substantially. To compare results fairly, each feasible objective is expressed as a percentage gap from a fixed, feasible reference solution for that instance. A gap below zero means the submitted solution improves on that reference. These reference solutions are not claimed to be optimal.</p>
        <ul>
          <li><strong>Complete submissions</strong> contain feasible solutions for all 100 official instances and are ranked by average percentage gap. Lower is better.</li>
          <li><strong>Partial submissions</strong> appear in a separate table, ordered by the number of feasible instances and then by average gap on those instances.</li>
          <li>A team’s best accepted run determines its rank. Its latest accepted run can be displayed alongside the ranked result. The optional Method field describes an approach but does not affect scoring.</li>
        </ul>
        <p><a href={sourceLink('docs/scoring-v1.md')}>Read the scoring contract</a> · <a href={sourceLink('data/reference_scores.v1.json')}>View the fixed reference values</a></p>
      </section>

      <section id="instances" className="text-section">
        <h2>Benchmark instances</h2>
        <p>The 100 official instances include a positive, directed matrix of loading and changeover costs. Each has a matched zero-cost instance with the same locations, fleet, stocks, demands, and identifier. The second set supports experiments on the effect of loading costs; only the cost-bearing set determines the official ranking.</p>
        <p>Instances vary in fleet size, number of depots and stations, product count, demand, available stock, spatial structure, and changeover-cost regime. Each file describes the problem data in a plain-text format.</p>
        <div className="buttons downloads">
          <a className="button is-link" href={assetUrl('benchmarks/with_changeover_costs.zip')} download>Official instances ZIP ↓</a>
          <a className="button is-link is-light" href={assetUrl('benchmarks/without_changeover_costs.zip')} download>Zero-cost counterparts ZIP ↓</a>
        </div>
      </section>

      <section id="formats" className="text-section">
        <h2>File formats and tools</h2>
        <p>Instance and solution files use the <code>.dat</code> extension. A solution describes each used vehicle’s route, its product configuration at every step, and delivered or loaded quantities. The evaluator matches a solution to an official instance by its three-digit identifier.</p>
        <p>Start with the <Link to="/examples">paired example files</Link>, then inspect your own files in the <Link to="/visualizer">interactive visualizer</Link>. The Python startup kit provides a framework and tools for developing solution methods.</p>
        <ul>
          <li><a href={sourceLink('docs/instance_format.md')}>Instance format specification</a></li>
          <li><a href={sourceLink('docs/solution_format.md')}>Solution format specification</a></li>
          <li><StartupLink /></li>
          <li><DocumentationLink /></li>
        </ul>
      </section>

      <section id="participation" className="text-section">
        <h2>Participation and future work</h2>
        <p>Researchers may contribute solutions through GitHub pull requests. The submission workflow will report feasibility and score before an accepted run appears in the public results. Both complete and partial work are welcome.</p>
        <p>The benchmark is also an invitation to explore practical applications. We are interested in partnerships that bring real distribution data and operational constraints to the model, and in sponsorship for an open competition on MPVRP–CC or an applied variant.</p>
        <p><Link to="/submit">Submission and leaderboard information</Link> · <Link to="/about">Organizers and contact</Link></p>
      </section>
    </main>
  );
}

function About() {
  return (
    <main className="wrap main-content content">
      <PageHeading label="About the project" title="Research, collaboration, and contact">
        MPVRP–CC is an open research platform for studying multi-product distribution with route and loading decisions in one model.
      </PageHeading>
      <section className="text-section"><h2>Research direction</h2><p>Our work combines operations research, mathematical modeling, and algorithm design. The current benchmark makes a theoretical problem reproducible and gives teams a common set of instances and evaluation rules. We aim to develop stronger methods and test the model in operational settings.</p><p>Real cases may add constraints such as time windows, service times, vehicle compatibility, safety requirements, or changing stock. These are opportunities for applied research and future benchmark variants; they are not included in the current official instances.</p></section>
      <section className="text-section"><h2>Partnerships and sponsorship</h2><p>We welcome conversations with logistics organizations, research groups, and sponsors. A partnership could study a specific delivery network, extend the model with real constraints, or support an open competition in which methods are compared under shared rules.</p></section>
      <section className="text-section"><h2>Organizers and questions</h2><p>For questions about the benchmark, data, or collaboration, contact <a href="mailto:vratheilhoundji@gmail.com?subject=MPVRP-CC%20collaboration">Ratheil Houndji</a> or <a href="mailto:perrierosas@gmail.com?subject=MPVRP-CC%20collaboration">Rosas Behoundja</a>. The <a href="https://github.com/uac-rrteam">UAC Ratheil Research Team</a> maintains the research context.</p><p>Technical corrections and reproducibility questions can also be raised in the <a href={`${siteConfig.repositoryUrl}/issues`}>project issue tracker</a>.</p></section>
    </main>
  );
}

function ExampleImage({ src, label }: { src?: string; label: string }) {
  return src
    ? <img src={assetUrl(`examples/${src}`)} alt={label} loading="lazy" />
    : <div className="image-pending" role="img" aria-label={`${label} image not available yet`}>Plot forthcoming</div>;
}

function Examples() {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const example = examples[selectedIndex];
  return (
    <main className="wrap main-content content">
      <PageHeading label="Example files" title="Instances and their solutions">
        Browse 20 selected official instances, each paired with an instance plot, a CP reference solution plot, and the underlying data files. These solutions are feasible references, not claimed optima.
      </PageHeading>
      <div className="example-picker">
        <label htmlFor="example-select" className="label">Choose an example</label>
        <div className="select is-link">
          <select id="example-select" value={selectedIndex} onChange={event => setSelectedIndex(Number(event.target.value))}>
            {examples.map((item, index) => <option key={item.id} value={index}>{item.id} — {item.description}</option>)}
          </select>
        </div>
        <span className="example-count">{selectedIndex + 1} of {examples.length}</span>
      </div>
      <section className="example-entry text-section" aria-live="polite">
        <h2>{example.title}: {example.description}</h2>
        <p>Cost-bearing scenario · {example.vehicles} {example.vehicles === 1 ? 'vehicle' : 'vehicles'} in the instance · {example.stations} stations · {example.layout} layout. A plotted solution may use fewer vehicles than the instance provides.</p>
        <div className="example-images">
          <figure><a href={assetUrl(`examples/${example.instanceImage}`)} target="_blank" rel="noreferrer"><ExampleImage src={example.instanceImage} label={`${example.title} instance plot`} /></a><figcaption>Instance network · <a href={assetUrl(`examples/${example.instanceImage}`)} target="_blank" rel="noreferrer">Open full size</a></figcaption></figure>
          <figure><a href={assetUrl(`examples/${example.solutionImage}`)} target="_blank" rel="noreferrer"><ExampleImage src={example.solutionImage} label={`${example.title} solution plot`} /></a><figcaption>CP reference solution · <a href={assetUrl(`examples/${example.solutionImage}`)} target="_blank" rel="noreferrer">Open full size</a></figcaption></figure>
        </div>
        <div className="buttons example-downloads">
          <a className="button is-link" href={assetUrl(`examples/${example.instanceFile}`)} download>Download instance (.dat)</a>
          <a className="button is-link is-light" href={assetUrl(`examples/${example.solutionFile}`)} download>Download solution (.dat)</a>
        </div>
      </section>
      <div className="example-navigation buttons">
        <button type="button" className="button" disabled={selectedIndex === 0} onClick={() => setSelectedIndex(index => index - 1)}>← Previous</button>
        <button type="button" className="button" disabled={selectedIndex === examples.length - 1} onClick={() => setSelectedIndex(index => index + 1)}>Next →</button>
      </div>
    </main>
  );
}

function Visualizer() {
  return (
    <main className="wrap main-content content">
      <PageHeading label="Interactive tool" title="Route visualizer">Inspect an instance and its solution by following vehicle routes, products, loads, and deliveries.</PageHeading>
      <section className="text-section"><h2>Explore an instance or solution</h2><p>Enter an official instance number from 1 to 100 to load its network and paired reference solution together. You can then upload your own solution file to inspect its routes, upload both files from your computer, or start with the built-in example. The full-screen view lets you pan, zoom, follow vehicles, and inspect deliveries and loading costs.</p><p><a className="button is-link" href={`${import.meta.env.BASE_URL}visualizer/index.html`}>Open the visualizer ↗</a></p><p>Return to this site using the “Back to site” link in the visualizer. The visualization runs entirely in your browser.</p></section>
    </main>
  );
}

function ScoreTable({ title, rows, showLatest, partial }: { title: string; rows: RankedTeam[]; showLatest: boolean; partial: boolean }) {
  return (
    <section className="text-section">
      <h2>{title}</h2>
      <p>{partial ? 'Progress is ordered by feasible count, then mean gap on the feasible subset. Different subsets may not be directly comparable.' : 'Complete runs have feasible solutions for all 100 official instances. Lower average gap is better.'}</p>
      {rows.length === 0 ? <div className="table-placeholder">No {partial ? 'partial' : 'complete'} submissions have been published yet.</div> : (
        <div className="table-container">
          <table className="table is-fullwidth is-hoverable leaderboard-table">
            <thead><tr><th scope="col">Rank</th><th scope="col">Team</th>{partial && <th scope="col">Feasible</th>}<th scope="col">Best gap</th><th scope="col">Method</th>{showLatest && <th scope="col">Latest run</th>}<th scope="col">Accepted</th></tr></thead>
            <tbody>{rows.map(({ rank, best, latest }) => (
              <tr key={best.teamId}>
                <td>{rank}</td>
                <td><strong>{best.teamName}</strong><br /><a className="run-link" href={`${siteConfig.repositoryUrl}/pull/${best.prNumber}`}>PR #{best.prNumber}</a></td>
                {partial && <td>{best.feasibleCount}/100</td>}
                <td>{best.meanGap === null ? '—' : `${best.meanGap.toFixed(3)}%`}</td>
                <td>{best.method || '—'}</td>
                {showLatest && <td>{latest.meanGap === null ? '—' : `${latest.meanGap.toFixed(3)}%`} · {latest.feasibleCount}/100<br /><span className="method-note">{latest.method || 'Method unspecified'}</span></td>}
                <td><time dateTime={best.acceptedAt}>{new Date(best.acceptedAt).toLocaleDateString()}</time></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Submit() {
  const [leaderboard, setLeaderboard] = useState<PublicLeaderboard | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [showLatest, setShowLatest] = useState(false);
  useEffect(() => {
    fetch(assetUrl('leaderboard.json'))
      .then(response => { if (!response.ok) throw new Error('Leaderboard unavailable'); return response.json(); })
      .then((data: PublicLeaderboard) => setLeaderboard(data))
      .catch(() => setLoadError(true));
  }, []);
  const ranked = rankTeams(leaderboard?.runs ?? []);
  return (
    <main className="wrap main-content content">
      <PageHeading label="Submissions and results" title="Compare methods on a common benchmark">
        Submit a ZIP of solution files through a GitHub pull request. Accepted runs will be evaluated against the fixed official instances and references.
      </PageHeading>
      <section className="text-section"><h2>How to submit</h2><ol><li>Prepare solution files named with the appropriate three-digit instance IDs and place them in a ZIP archive.</li><li>Open a pull request in the <a href={siteConfig.repositoryUrl}>project repository</a> with the archive, team name, and an optional Method description such as heuristic, CP, LP, or ML.</li><li>Review the automated feasibility and scoring report. A maintainer will publish an accepted result.</li></ol><p><a href={sourceLink('SUBMITTING.md')}>Read the submission guide and package limits</a></p></section>
      <div className="leaderboard-controls"><span>Scoring version {leaderboard?.scoringVersion ?? siteConfig.scoringVersion} · {leaderboard?.runs.length ? `Latest accepted run: ${new Date(Math.max(...leaderboard.runs.map(run => Date.parse(run.acceptedAt)))).toLocaleDateString()}` : 'No accepted runs yet'}</span><label className="checkbox"><input type="checkbox" checked={showLatest} onChange={event => setShowLatest(event.target.checked)} /> Show latest run alongside best</label></div>
      {loadError ? <p role="alert">The leaderboard could not be loaded. Please try again later.</p> : leaderboard === null ? <p>Loading leaderboard…</p> : <><ScoreTable title="Complete submissions" rows={ranked.complete} showLatest={showLatest} partial={false} /><ScoreTable title="Partial submissions" rows={ranked.partial} showLatest={showLatest} partial /></>}
      <section className="text-section"><h2>Reading the results</h2><p>A team’s best accepted run sets its rank. Its latest run can be displayed alongside that result without changing rank. Method labels describe the approach used for an individual run; they do not affect scoring.</p><p><a href={sourceLink('docs/scoring-v1.md')}>Full scoring and ranking rules</a></p></section>
    </main>
  );
}

function App() {
  return (
    <HashRouter>
      <Header />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<About />} />
        <Route path="/examples" element={<Examples />} />
        <Route path="/visualizer" element={<Visualizer />} />
        <Route path="/submit" element={<Submit />} />
        <Route path="*" element={<main className="wrap main-content content"><h1>Page not found</h1><Link to="/">Return to the overview</Link></main>} />
      </Routes>
      <Footer />
    </HashRouter>
  );
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
