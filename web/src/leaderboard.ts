export interface Run {
  prNumber: number;
  teamId: string;
  teamName: string;
  method: string;
  runId: string;
  acceptedAt: string;
  headSha: string;
  archiveSha256: string;
  complete: boolean;
  feasibleCount: number;
  meanGap: number | null;
}

export interface PublicLeaderboard { scoringVersion: string; runs: Run[] }
export interface RankedTeam { rank: number; best: Run; latest: Run }

const gap = (run: Run) => run.meanGap ?? Number.POSITIVE_INFINITY;
const earlier = (a: Run, b: Run) => a.acceptedAt.localeCompare(b.acceptedAt) || a.prNumber - b.prNumber;
const completeOrder = (a: Run, b: Run) => gap(a) - gap(b) || earlier(a, b);
const partialOrder = (a: Run, b: Run) => b.feasibleCount - a.feasibleCount || gap(a) - gap(b) || earlier(a, b);

export function rankTeams(runs: Run[]): { complete: RankedTeam[]; partial: RankedTeam[] } {
  const byTeam = new Map<string, Run[]>();
  for (const run of runs) {
    if (!byTeam.has(run.teamId)) byTeam.set(run.teamId, []);
    byTeam.get(run.teamId)!.push(run);
  }
  const complete: Array<{ best: Run; latest: Run }> = [];
  const partial: Array<{ best: Run; latest: Run }> = [];
  for (const teamRuns of byTeam.values()) {
    const latest = [...teamRuns].sort((a, b) => -earlier(a, b))[0];
    const completeRuns = teamRuns.filter(run => run.complete);
    if (completeRuns.length) complete.push({ best: [...completeRuns].sort(completeOrder)[0], latest });
    else partial.push({ best: [...teamRuns].sort(partialOrder)[0], latest });
  }
  complete.sort((a, b) => completeOrder(a.best, b.best));
  partial.sort((a, b) => partialOrder(a.best, b.best));
  return {
    complete: complete.map((team, index) => ({ ...team, rank: index + 1 })),
    partial: partial.map((team, index) => ({ ...team, rank: index + 1 })),
  };
}
