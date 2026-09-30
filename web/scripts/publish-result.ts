import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { PublicLeaderboard, Run } from '../src/leaderboard';

const [reportArgument, prNumberArgument] = process.argv.slice(2);
const prNumber = Number(prNumberArgument);
if (!reportArgument || !Number.isSafeInteger(prNumber) || prNumber < 1) throw new Error('Usage: publish-result.ts REPORT_JSON PR_NUMBER');
const root = resolve(import.meta.dirname, '../..');
const path = process.env.LEADERBOARD_FILE ? resolve(process.env.LEADERBOARD_FILE) : resolve(root, 'leaderboard/runs.json');
const leaderboard = JSON.parse(await readFile(path, 'utf8')) as PublicLeaderboard;
const report = JSON.parse(await readFile(resolve(reportArgument), 'utf8')) as {
  teamId: string; teamName: string; method: string; runId: string; headSha: string; archiveSha256: string;
  score: { scoringVersion: string; complete: boolean; feasibleCount: number; meanGap: number | null; details: unknown[] };
};
if (leaderboard.scoringVersion !== '1.0.0' || report.score.scoringVersion !== leaderboard.scoringVersion) throw new Error('Scoring version mismatch');
if (leaderboard.runs.some(run => run.prNumber === prNumber)) throw new Error(`Pull request #${prNumber} was already published`);
if (!Array.isArray(report.score.details) || report.score.details.length !== 100) throw new Error('Incomplete scoring report');
if (report.score.feasibleCount < 0 || report.score.feasibleCount > 100 || report.score.complete !== (report.score.feasibleCount === 100)) throw new Error('Inconsistent feasibility count');
if (report.score.meanGap !== null && !Number.isFinite(report.score.meanGap)) throw new Error('Invalid mean gap');
const run: Run = {
  prNumber,
  teamId: report.teamId,
  teamName: report.teamName,
  method: report.method,
  runId: report.runId,
  acceptedAt: new Date().toISOString(),
  headSha: report.headSha,
  archiveSha256: report.archiveSha256,
  complete: report.score.complete,
  feasibleCount: report.score.feasibleCount,
  meanGap: report.score.meanGap,
};
leaderboard.runs.push(run);
await writeFile(path, JSON.stringify(leaderboard, null, 2) + '\n');
console.log(`Published PR #${prNumber}: ${run.feasibleCount}/100, ${run.meanGap ?? 'N/A'}%`);
