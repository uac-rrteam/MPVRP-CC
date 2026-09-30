import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import * as yauzl from 'yauzl';
import { parseInstance, parseSolution, verifySolution } from '../src/scoring/core';

const MAX_COMPRESSED_BYTES = 25 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 100 * 1024 * 1024;
const MAX_FILES = 1000;
const MAX_SOLUTION_BYTES = 2 * 1024 * 1024;
const SOLUTION_NAME = /^Sol_(?:MPVRP_)?(\d{3})(?:_.*)?\.dat$/i;
const root = resolve(import.meta.dirname, '../..');

type Reference = { id: string; instance: string; instance_sha256: string; objective: number };
type Detail = { id: string; feasible: boolean; objective: number | null; reference: number; gap: number | null; errors: string[] };

function safeArchiveName(name: string): boolean {
  return !name.startsWith('/') && !name.includes('\\') && !name.includes('\0') &&
    !/^[A-Za-z]:/.test(name) && name.split('/').every(part => part !== '..' && part !== '.');
}

async function entryText(zip: yauzl.ZipFile, entry: yauzl.Entry): Promise<string> {
  if (entry.uncompressedSize > MAX_SOLUTION_BYTES) throw new Error(`Solution file too large: ${entry.fileName}`);
  const stream = await zip.openReadStreamPromise(entry);
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_SOLUTION_BYTES) {
      stream.destroy();
      throw new Error(`Solution file too large after decompression: ${entry.fileName}`);
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function readArchive(archive: string): Promise<{ solutions: Map<string, string>; duplicates: Set<string>; warnings: string[] }> {
  if ((await stat(archive)).size > MAX_COMPRESSED_BYTES) throw new Error('ZIP exceeds the 25 MB compressed-size limit');
  const zip = await yauzl.openPromise(archive, { lazyEntries: true, autoClose: false, strictFileNames: true, validateEntrySizes: true });
  const solutions = new Map<string, string>();
  const duplicates = new Set<string>();
  const warnings: string[] = [];
  let files = 0;
  let totalSize = 0;
  try {
    for await (const entry of zip.eachEntry()) {
      files++;
      if (files > MAX_FILES) throw new Error('ZIP contains more than 1,000 entries');
      if (!safeArchiveName(entry.fileName)) throw new Error(`Unsafe archive path: ${entry.fileName}`);
      totalSize += entry.uncompressedSize;
      if (totalSize > MAX_UNCOMPRESSED_BYTES) throw new Error('ZIP exceeds the 100 MB extracted-size limit');
      if (entry.fileName.endsWith('/')) continue;
      const filename = basename(entry.fileName);
      const match = filename.match(SOLUTION_NAME);
      if (!match) { warnings.push(`Ignored unrecognized file: ${filename}`); continue; }
      const id = match[1];
      if (duplicates.has(id)) continue;
      if (solutions.has(id)) {
        solutions.delete(id);
        duplicates.add(id);
        warnings.push(`Instance ${id}: duplicate solution candidates rejected`);
        continue;
      }
      solutions.set(id, await entryText(zip, entry));
    }
  } finally {
    zip.close();
  }
  return { solutions, duplicates, warnings };
}

export async function scoreSubmission(archive: string) {
  const manifest = JSON.parse(await readFile(resolve(root, 'data/reference_scores.v1.json'), 'utf8')) as {
    scoring_version: string;
    entries: Reference[];
  };
  if (manifest.scoring_version !== '1.0.0' || manifest.entries.length !== 100) throw new Error('Unsupported reference manifest');
  const { solutions, duplicates, warnings } = await readArchive(archive);
  const details: Detail[] = [];
  for (const reference of manifest.entries) {
    const path = resolve(root, 'data/instances/in', reference.instance);
    const bytes = await readFile(path);
    if (createHash('sha256').update(bytes).digest('hex') !== reference.instance_sha256) throw new Error(`Official instance ${reference.id} changed`);
    const submitted = solutions.get(reference.id);
    if (!submitted) {
      details.push({ id: reference.id, feasible: false, objective: null, reference: reference.objective, gap: null, errors: [duplicates.has(reference.id) ? 'Duplicate solution candidates' : 'Missing solution'] });
      continue;
    }
    try {
      const result = verifySolution(parseInstance(bytes.toString('utf8')), parseSolution(submitted));
      const objective = result.objective;
      details.push({
        id: reference.id,
        feasible: result.feasible,
        objective,
        reference: reference.objective,
        gap: objective === null ? null : 100 * (objective - reference.objective) / reference.objective,
        errors: result.errors,
      });
    } catch (error) {
      details.push({ id: reference.id, feasible: false, objective: null, reference: reference.objective, gap: null, errors: [`Parsing or verification error: ${error instanceof Error ? error.message : String(error)}`] });
    }
  }
  const feasible = details.filter(detail => detail.feasible);
  const meanGap = feasible.length ? feasible.reduce((sum, detail) => sum + detail.gap!, 0) / feasible.length : null;
  return {
    scoringVersion: manifest.scoring_version,
    complete: feasible.length === 100,
    feasibleCount: feasible.length,
    meanGap,
    warnings: warnings.slice(0, 50),
    details,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const archive = process.argv[2];
  if (!archive) { console.error('Usage: npm run score -- path/to/submission.zip [output.json]'); process.exit(2); }
  try {
    const result = await scoreSubmission(resolve(archive));
    const json = JSON.stringify(result, null, 2) + '\n';
    if (process.argv[3]) await writeFile(resolve(process.argv[3]), json);
    else process.stdout.write(json);
    console.error(`Scored ${result.feasibleCount}/100 feasible instances; mean gap ${result.meanGap === null ? 'N/A' : `${result.meanGap}%`}.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
