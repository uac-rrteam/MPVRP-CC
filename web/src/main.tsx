import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Link, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { assetUrl, siteConfig } from './config';
import { examples } from './examples';
import { rankTeams, type PublicLeaderboard, type RankedTeam } from './leaderboard';
import { ArrowUpRight, Mail, Menu, Route as RouteIcon, X } from 'lucide-react';
import './style.css';

const navigation = [
  ['/', 'Overview'],
  ['/examples', 'Examples'],
  ['/submit', 'Submissions & results'],
] as const;

const sourceLink = (path: string) => `${siteConfig.repositoryUrl}/blob/main/${path}`;

function GitHubIcon({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .9a11.1 11.1 0 0 0-3.51 21.63c.55.1.76-.24.76-.54v-2.13c-3.1.68-3.75-1.32-3.75-1.32-.5-1.28-1.24-1.62-1.24-1.62-1.01-.69.08-.68.08-.68 1.12.08 1.71 1.15 1.71 1.15 1 .1 1.69-.75 2.07-1.15.1-.73.39-1.23.71-1.51-2.47-.28-5.06-1.24-5.06-5.49 0-1.21.43-2.2 1.15-2.97-.12-.28-.5-1.4.11-2.92 0 0 .94-.3 3.05 1.13a10.6 10.6 0 0 1 5.56 0c2.11-1.43 3.05-1.13 3.05-1.13.61 1.52.23 2.64.11 2.92.72.77 1.15 1.76 1.15 2.97 0 4.26-2.59 5.21-5.07 5.48.4.35.76 1.02.76 2.06v3.05c0 .3.2.65.77.54A11.1 11.1 0 0 0 12 .9Z" /></svg>;
}

function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <nav className="site-header" role="navigation" aria-label="Main navigation">
      <div className="nav-container">
        <Link className="brand" to="/" onClick={() => setMenuOpen(false)}><span className="brand-mark"><RouteIcon size={21} strokeWidth={2.4} /></span><span>MPVRP<span className="brand-accent">–CC</span></span></Link>
        <button className="menu-toggle" type="button" aria-label="Toggle navigation" aria-controls="site-menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(value => !value)}>
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
        <div id="site-menu" className={`nav-links ${menuOpen ? 'nav-open' : ''}`}>
            {navigation.map(([path, label]) => (
              <NavLink key={path} to={path} end={path === '/'} onClick={() => setMenuOpen(false)} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                {label}
              </NavLink>
            ))}
        </div>
        <a className="nav-repository" href={siteConfig.repositoryUrl} target="_blank" rel="noreferrer"><GitHubIcon /><ArrowUpRight size={16} /></a>
      </div>
    </nav>
  );
}

function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div className="footer-top">
          <div className="footer-about"><Link className="footer-brand" to="/"><span className="brand-mark"><RouteIcon size={20} /></span> MPVRP–CC</Link><p>An open benchmark for research on multi-product vehicle routing with changeover costs.</p><div className="partner-logos">{[['logoifri.png', 'IFRI'], ['logouac.png', 'University of Abomey-Calavi'], ['lrsia-sans-fond.png', 'LRSIA'], ['RTL_WH.png', 'RTL']].map(([file, name]) => <img key={file} src={assetUrl(`logos/${file}`)} alt={name} loading="lazy" />)}</div></div>
          <div className="footer-column"><h2>Explore</h2><Link to="/">Overview</Link><Link to="/examples">Examples</Link><a href={`${import.meta.env.BASE_URL}visualizer/index.html`}>Visualizer</a><Link to="/submit">Submissions & results</Link></div>
          <div className="footer-column"><h2>Connect</h2><a href={siteConfig.repositoryUrl}><GitHubIcon /> Source repository</a><a href="mailto:vratheilhoundji@gmail.com?subject=MPVRP-CC%20collaboration"><Mail size={16} /> Organizers and contact</a></div>
        </div>
      </div>
    </footer>
  );
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
    <main className="home-layout main-content content">
      <div className="home-article">
      <h1 className="sr-only">Multi-Product Vehicle Routing with Changeover Costs</h1>

      <div className="alert intro-note">
        <strong>At a glance.</strong> The benchmark contains 100 official instances and 100 matched zero-cost variants. We provide instance files, reference solutions, examples, an interactive visualizer, and a public submission process. The project is in an academic research phase.
      </div>

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
          <a className="btn btn-primary" href={assetUrl('benchmarks/with_changeover_costs.zip')} download>Official instances ZIP ↓</a>
          <a className="btn btn-soft" href={assetUrl('benchmarks/without_changeover_costs.zip')} download>Zero-cost counterparts ZIP ↓</a>
        </div>
      </section>

      <section id="formats" className="text-section">
        <h2>File formats and tools</h2>
        <p>Instance and solution files use the <code>.dat</code> extension. A solution describes each used vehicle’s route, its product configuration at every step, and delivered or loaded quantities. The evaluator matches a solution to an official instance by its three-digit identifier.</p>
        <p>Start with the <Link to="/examples">paired example files</Link>, then inspect your own files in the <a href={`${import.meta.env.BASE_URL}visualizer/index.html`}>interactive visualizer</a>. The Python startup kit provides a framework and tools for developing solution methods.</p>
        <ul>
          <li><a href={sourceLink('docs/instance_format.md')}>Instance format specification</a></li>
          <li><a href={sourceLink('docs/solution_format.md')}>Solution format specification</a></li>
          <li><StartupLink /></li>
          <li><DocumentationLink /></li>
        </ul>
      </section>

      <section id="visualization" className="text-section">
        <h2>Explore with the visualizer</h2>
        <p>Enter an official instance number from 1 to 100 to load its network and paired reference solution together. You can upload your own solution file, upload both files from your computer, or start with the built-in example.</p>
        <p>The full-screen view lets you pan, zoom, follow vehicles, and inspect deliveries and loading costs. It runs entirely in your browser.</p>
        <p><a className="btn btn-primary" href={`${import.meta.env.BASE_URL}visualizer/index.html`}>Open the visualizer ↗</a></p>
      </section>

      <section id="participation" className="text-section">
        <h2>Participation and future work</h2>
        <p>Researchers may contribute solutions through GitHub pull requests. The submission workflow will report feasibility and score before an accepted run appears in the public results. Both complete and partial work are welcome.</p>
        <p>The benchmark is also an invitation to explore practical applications. We are interested in partnerships that bring real distribution data and operational constraints to the model, and in sponsorship for an open competition on MPVRP–CC or an applied variant.</p>
        <p><Link to="/submit">Submission and leaderboard information</Link></p>
      </section>
      <section id="research" className="text-section">
        <h2>Research and collaboration</h2>
        <p>Our work combines operations research, mathematical modeling, and algorithm design. The benchmark makes a theoretical problem reproducible and gives teams shared instances and evaluation rules. We aim to develop stronger methods and test the model in operational settings.</p>
        <p>Real cases may add time windows, service times, vehicle compatibility, safety requirements, or changing stock. These are opportunities for applied research and future benchmark variants; they are not included in the current official instances.</p>
        <p>We welcome conversations with logistics organizations, research groups, and sponsors. A partnership could study a specific delivery network, extend the model with real constraints, or support an open competition under shared rules.</p>
        <p>For questions about the benchmark, data, or collaboration, contact <a href="mailto:vratheilhoundji@gmail.com?subject=MPVRP-CC%20collaboration">Ratheil Houndji</a> or <a href="mailto:perrierosas@gmail.com?subject=MPVRP-CC%20collaboration">Rosas Behoundja</a>. The <a href="https://github.com/uac-rrteam">UAC Ratheil Research Team</a> maintains the research context.</p>
        <p>Technical corrections and reproducibility questions can also be raised in the <a href={`${siteConfig.repositoryUrl}/issues`}>project issue tracker</a>.</p>
      </section>
      </div>
      <nav className="home-toc" aria-label="On this page">
        <p>On this page</p>
        {[
          ['problem', 'Problem statement'],
          ['evaluation', 'Evaluation and ranking'],
          ['instances', 'Benchmark instances'],
          ['formats', 'Files and tools'],
          ['visualization', 'Visualizer'],
          ['participation', 'Participation'],
          ['research', 'Research and collaboration'],
        ].map(([id, label]) => <button key={id} type="button" onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })}>{label}</button>)}
      </nav>
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
  const [preview, setPreview] = useState<{ src: string; label: string } | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!preview) return;
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setPreview(null); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [preview]);
  const example = examples[selectedIndex];
  return (
    <main className="wrap main-content content">
      <h1 className="sr-only">Instances and their solutions</h1>
      <div className="example-picker">
        <label htmlFor="example-select" className="label">Choose an example</label>
        <div className="example-select-wrap">
          <select className="select" id="example-select" value={selectedIndex} onChange={event => setSelectedIndex(Number(event.target.value))}>
            {examples.map((item, index) => <option key={item.id} value={index}>{item.id} — {item.description}</option>)}
          </select>
        </div>
        <span className="example-count">{selectedIndex + 1} of {examples.length}</span>
      </div>
      <section className="example-entry text-section" aria-live="polite">
        <h2>{example.title}: {example.description}</h2>
        <p>Cost-bearing scenario · {example.vehicles} {example.vehicles === 1 ? 'vehicle' : 'vehicles'} in the instance · {example.stations} stations · {example.layout} layout. A plotted solution may use fewer vehicles than the instance provides.</p>
        <div className="example-images">
          <figure><button className="example-image-button" type="button" onClick={() => setPreview({ src: example.instanceImage, label: `${example.title} instance plot` })} aria-label="Preview instance network"><ExampleImage src={example.instanceImage} label={`${example.title} instance plot`} /></button><figcaption>Instance network · <button className="preview-link" type="button" onClick={() => setPreview({ src: example.instanceImage, label: `${example.title} instance plot` })}>View larger</button></figcaption></figure>
          <figure><button className="example-image-button" type="button" onClick={() => setPreview({ src: example.solutionImage, label: `${example.title} solution plot` })} aria-label="Preview reference solution"><ExampleImage src={example.solutionImage} label={`${example.title} solution plot`} /></button><figcaption>CP reference solution · <button className="preview-link" type="button" onClick={() => setPreview({ src: example.solutionImage, label: `${example.title} solution plot` })}>View larger</button></figcaption></figure>
        </div>
        <div className="buttons example-downloads">
          <a className="btn btn-primary" href={assetUrl(`examples/${example.instanceFile}`)} download>Download instance (.dat)</a>
          <a className="btn btn-soft" href={assetUrl(`examples/${example.solutionFile}`)} download>Download solution (.dat)</a>
        </div>
      </section>
      <div className="example-navigation buttons">
        <button type="button" className="btn btn-outline" disabled={selectedIndex === 0} onClick={() => setSelectedIndex(index => index - 1)}>← Previous</button>
        <button type="button" className="btn btn-outline" disabled={selectedIndex === examples.length - 1} onClick={() => setSelectedIndex(index => index + 1)}>Next →</button>
      </div>
      {preview && <div className="preview-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setPreview(null); }}><div className="preview-dialog" role="dialog" aria-modal="true" aria-label={preview.label}><button ref={closeButtonRef} className="preview-close" type="button" aria-label="Close image preview" onClick={() => setPreview(null)}><X size={22} /></button><img src={assetUrl(`examples/${preview.src}`)} alt={preview.label} /><p>{preview.label}</p></div></div>}
    </main>
  );
}

function ScoreTable({ title, rows, showLatest, partial }: { title: string; rows: RankedTeam[]; showLatest: boolean; partial: boolean }) {
  return (
    <section className="text-section">
      <h2>{title}</h2>
      <p>{partial ? 'Progress is ordered by feasible count, then mean gap on the feasible subset. Different subsets may not be directly comparable.' : 'Complete runs have feasible solutions for all 100 official instances. Lower average gap is better.'}</p>
      {rows.length === 0 ? <div className="table-placeholder">No {partial ? 'partial' : 'complete'} submissions have been published yet.</div> : (
        <div className="overflow-x-auto table-container">
          <table className="table table-zebra leaderboard-table">
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
      <h1 className="sr-only">Compare methods on a common benchmark</h1>
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
        <Route path="/examples" element={<Examples />} />
        <Route path="/submit" element={<Submit />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Footer />
    </HashRouter>
  );
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
