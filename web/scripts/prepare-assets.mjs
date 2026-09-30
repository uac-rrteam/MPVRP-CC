import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const target = resolve(import.meta.dirname, '../public/assets');
await mkdir(target, { recursive: true });

for (const [source, destination] of [
  ['data/zips', 'benchmarks'],
  ['data/examples', 'examples'],
  ['pages/static/imgs/logos', 'logos'],
]) {
  await cp(resolve(root, source), resolve(target, destination), { recursive: true, force: true });
}
await cp(resolve(root, 'leaderboard/runs.json'), resolve(target, 'leaderboard.json'));
await cp(resolve(root, 'mpvrp-cc-startup.zip'), resolve(target, 'mpvrp-cc-startup.zip'));

// Keep the established canvas visualizer as a full-screen static tool while the
// surrounding site moves to React. Its existing relative URLs remain valid.
const visualizerTarget = resolve(import.meta.dirname, '../public/visualizer');
await mkdir(resolve(visualizerTarget, 'static/css'), { recursive: true });
await mkdir(resolve(visualizerTarget, 'static/js'), { recursive: true });
await cp(resolve(root, 'pages/visualisation.html'), resolve(visualizerTarget, 'index.html'));
for (const css of ['visualisation.css', 'app.css']) {
  await cp(resolve(root, 'pages/static/css', css), resolve(visualizerTarget, 'static/css', css));
}
await cp(resolve(root, 'pages/static/js/visualisation.js'), resolve(visualizerTarget, 'static/js/visualisation.js'));
await cp(resolve(root, 'data/examples'), resolve(import.meta.dirname, '../public/data/examples'), { recursive: true, force: true });
const references = JSON.parse(await readFile(resolve(root, 'data/reference_scores.v1.json'), 'utf8'));
const officialPairs = Object.fromEntries(references.entries.map(({ id, instance, solution }) => [id, { instance, solution }]));
if (Object.keys(officialPairs).length !== 100) throw new Error('Expected 100 official visualizer pairs');
await mkdir(resolve(target, 'instances'), { recursive: true });
await mkdir(resolve(target, 'solutions'), { recursive: true });
for (const { instance, solution } of Object.values(officialPairs)) {
  await cp(resolve(root, 'data/instances/in', instance), resolve(target, 'instances', instance));
  await cp(resolve(root, 'data/solutions/in', solution), resolve(target, 'solutions', solution));
}
await writeFile(resolve(visualizerTarget, 'instances.json'), JSON.stringify(officialPairs) + '\n');

const selection = await readFile(resolve(root, 'images/selected_solution_images.txt'), 'utf8');
const instanceFiles = await readdir(resolve(root, 'data/instances/in'));
const solutionFiles = await readdir(resolve(root, 'data/solutions/in'));
const examples = [];

for (const line of selection.split(/\r?\n/)) {
  const match = line.match(/^(\d{3})\s+(\d+)\s+(\d+)\s+(\S+)\s+(.+?)\s+(\S+\.png)$/);
  if (!match) continue;
  const [, id, vehicles, stations, layout, reason, listedImage] = match;
  const expectedSolutionImage = `instance_${id}_cp_solution_landscape.png`;
  if (!listedImage.endsWith(`/${expectedSolutionImage}`)) {
    throw new Error(`Selected image mismatch for instance ${id}: ${listedImage}`);
  }
  const instanceImage = `instance_${id}_landscape.png`;
  const instanceMatches = instanceFiles.filter(name => name.startsWith(`MPVRP_${id}_`) && name.endsWith('.dat'));
  const solutionMatches = solutionFiles.filter(name => name.startsWith(`Sol_${id}_`) && name.endsWith('.dat'));
  if (instanceMatches.length !== 1 || solutionMatches.length !== 1) {
    throw new Error(`Expected one official instance and solution for ${id}`);
  }
  const instanceFile = instanceMatches[0];
  const solutionFile = solutionMatches[0];
  for (const [source, name] of [
    [`images/plots/${instanceImage}`, instanceImage],
    [`images/plots/${expectedSolutionImage}`, expectedSolutionImage],
    [`data/instances/in/${instanceFile}`, instanceFile],
    [`data/solutions/in/${solutionFile}`, solutionFile],
  ]) {
    await cp(resolve(root, source), resolve(target, 'examples', name));
  }
  examples.push({
    id,
    title: `Instance ${id}`,
    description: reason.trim(),
    vehicles: Number(vehicles),
    stations: Number(stations),
    layout,
    instanceFile,
    solutionFile,
    instanceImage,
    solutionImage: expectedSolutionImage,
  });
}

if (examples.length !== 20 || new Set(examples.map(example => example.id)).size !== examples.length) {
  throw new Error(`Expected 20 distinct selected examples, found ${examples.length}`);
}

const generated = resolve(import.meta.dirname, '../src/generated');
await mkdir(generated, { recursive: true });
await writeFile(resolve(generated, 'examples.json'), JSON.stringify(examples, null, 2) + '\n');
