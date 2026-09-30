import assert from 'node:assert/strict';
import { rankTeams, type Run } from '../src/leaderboard';

function run(teamId: string, prNumber: number, feasibleCount: number, meanGap: number, acceptedAt: string): Run {
  return { teamId, teamName: teamId, prNumber, feasibleCount, meanGap, acceptedAt, complete: feasibleCount === 100, method: '', runId: String(prNumber), headSha: '', archiveSha256: '' };
}

const ranked = rankTeams([
  run('alpha', 1, 80, -20, '2026-01-01T00:00:00Z'),
  run('alpha', 2, 100, 5, '2026-01-02T00:00:00Z'),
  run('alpha', 3, 60, -30, '2026-01-03T00:00:00Z'),
  run('beta', 4, 100, 2, '2026-01-04T00:00:00Z'),
  run('gamma', 5, 80, 1, '2026-01-05T00:00:00Z'),
  run('gamma', 6, 90, 10, '2026-01-06T00:00:00Z'),
]);

assert.deepEqual(ranked.complete.map(team => [team.best.teamId, team.best.prNumber, team.latest.prNumber]), [['beta', 4, 4], ['alpha', 2, 3]]);
assert.deepEqual(ranked.partial.map(team => [team.best.teamId, team.best.prNumber]), [['gamma', 6]]);
assert.deepEqual(ranked.complete.map(team => team.rank), [1, 2]);
console.log('Leaderboard ordering and best/latest selection verified.');
