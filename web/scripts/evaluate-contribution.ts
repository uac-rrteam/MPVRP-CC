import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstat, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { scoreSubmission } from './score-submission';

const [contributionArgument, baseSha, author, outputArgument] = process.argv.slice(2);
if (!contributionArgument || !baseSha || !author || !outputArgument) {
  throw new Error('Usage: evaluate-contribution.ts CONTRIBUTION_DIR BASE_SHA PR_AUTHOR OUTPUT_JSON');
}
if (!/^[a-f0-9]{40}$/i.test(baseSha)) throw new Error('Invalid base commit SHA');
if (!/^[A-Za-z0-9-]{1,39}$/.test(author)) throw new Error('Invalid GitHub author login');

const contribution = resolve(contributionArgument);
const diff = execFileSync('git', ['-C', contribution, 'diff', '--name-status', `${baseSha}...HEAD`], { encoding: 'utf8' }).trim().split('\n');
if (diff.length !== 2) throw new Error('A submission PR must add exactly two files: submission.json and solutions.zip');
const files = diff.map(line => {
  const match = line.match(/^A\s+(.+)$/);
  if (!match) throw new Error(`Submission PR may only add files: ${line}`);
  return match[1];
});
const directoryMatch = files.find(file => file.endsWith('/solutions.zip'))?.match(/^submissions\/([A-Za-z0-9-]+)\/([A-Za-z0-9_-]{1,50})\/solutions\.zip$/);
if (!directoryMatch) throw new Error('Solutions ZIP must be submissions/GITHUB_LOGIN/RUN_ID/solutions.zip');
const [, teamId, runId] = directoryMatch;
if (teamId.toLowerCase() !== author.toLowerCase()) throw new Error('Submission directory must use the pull-request author’s GitHub login');
const directory = `submissions/${teamId}/${runId}`;
if (!files.includes(`${directory}/submission.json`)) throw new Error('The same directory must contain submission.json');
for (const filename of ['submission.json', 'solutions.zip']) {
  if (!(await lstat(resolve(contribution, directory, filename))).isFile()) throw new Error(`${filename} must be a regular file`);
}

const metadata = JSON.parse(await readFile(resolve(contribution, directory, 'submission.json'), 'utf8')) as { teamName?: unknown; method?: unknown };
if (typeof metadata.teamName !== 'string' || metadata.teamName.trim().length < 2 || metadata.teamName.trim().length > 80) throw new Error('teamName must contain 2–80 characters');
if (metadata.method !== undefined && (typeof metadata.method !== 'string' || metadata.method.trim().length > 100)) throw new Error('method must be a string of at most 100 characters');
const teamName = metadata.teamName.trim();
const method = typeof metadata.method === 'string' ? metadata.method.trim() : '';
if (/[\x00-\x1f<>]/.test(teamName + method)) throw new Error('Metadata contains unsupported control or markup characters');

const archive = resolve(contribution, directory, 'solutions.zip');
const score = await scoreSubmission(archive);
const headSha = execFileSync('git', ['-C', contribution, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const archiveSha256 = createHash('sha256').update(await readFile(archive)).digest('hex');
const report = { teamId: teamId.toLowerCase(), teamName, method, runId, headSha, archiveSha256, score };
await writeFile(resolve(outputArgument), JSON.stringify(report, null, 2) + '\n');

const summary = [
  `## MPVRP–CC submission result`,
  ``,
  `Team: **${teamName}** (@${author})`,
  `Method: ${method || 'Not specified'}`,
  `Feasible instances: **${score.feasibleCount}/100**`,
  `Table: **${score.complete ? 'Complete' : 'Partial'}**`,
  `Mean gap to fixed references: **${score.meanGap === null ? 'N/A' : `${score.meanGap.toFixed(4)}%`}**`,
  `Scoring version: ${score.scoringVersion}`,
  ``,
  `See the JSON artifact for per-instance errors and values.`,
].join('\n');
if (process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY, summary + '\n', { flag: 'a' });
console.log(summary);
