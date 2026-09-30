import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseInstance, parseSolution, verifySolution } from '../src/scoring/core';

const root = resolve(import.meta.dirname, '../..');
const manifest = JSON.parse(await readFile(resolve(root, 'data/reference_scores.v1.json'), 'utf8')) as {
  scoring_version: string;
  entries: Array<{
    id: string;
    instance: string;
    solution: string;
    instance_sha256: string;
    solution_sha256: string;
    distance: number;
    changeover: number;
    objective: number;
  }>;
};
if (manifest.scoring_version !== '1.0.0' || manifest.entries.length !== 100) throw new Error('Reference manifest version or count changed');

for (const entry of manifest.entries) {
  const instance = await readFile(resolve(root, 'data/instances/in', entry.instance));
  const solution = await readFile(resolve(root, 'data/solutions/in', entry.solution));
  if (createHash('sha256').update(instance).digest('hex') !== entry.instance_sha256) throw new Error(`Instance ${entry.id} hash changed`);
  if (createHash('sha256').update(solution).digest('hex') !== entry.solution_sha256) throw new Error(`Solution ${entry.id} hash changed`);
  const result = verifySolution(parseInstance(instance.toString('utf8')), parseSolution(solution.toString('utf8')));
  if (!result.feasible) throw new Error(`Reference ${entry.id} infeasible: ${result.errors.slice(0, 3).join('; ')}`);
  if (result.metrics.distanceTotal !== entry.distance || result.metrics.totalSwitchCost !== entry.changeover || result.objective !== entry.objective) {
    throw new Error(`Reference ${entry.id} metrics differ from the frozen Python results`);
  }
}
console.log('All 100 TypeScript reference checks match the frozen Python results.');
