import { machinePerTick, workloadCapacity } from './production.ts';
import type { Facility } from './facility.ts';

export type ProjectReservation = {
  id: string;
  projectId: string;
  rack: string;
  startedAt: number;
  readyAt: number;
};
export type CommissioningWork = ProjectReservation & {
  version: 1;
  capacity: number;
  duration: number;
  pausedOutput: number;
};
export const projectLoanQuote = (f: Facility, rack: string) => {
  const capacity = workloadCapacity(f, rack);
  if (!capacity) throw new Error('Choose a built machine.');
  const duration = 15 * Math.ceil(20 / capacity);
  return {
    capacity,
    duration,
    pausedOutput: (machinePerTick(f, rack) * duration) / 15,
  };
};
export function validProjectReservations(
  value: unknown,
): value is ProjectReservation[] {
  if (!Array.isArray(value) || value.length > 14) return false;
  const ids = new Set<string>();
  return value.every((r) => {
    if (
      !r ||
      typeof r !== 'object' ||
      typeof r.id !== 'string' ||
      typeof r.projectId !== 'string' ||
      !/^[a-f0-9-]{36}$/.test(r.id) ||
      !/^[a-f0-9-]{36}$/.test(r.projectId) ||
      !/^rack-[a-g]$/.test(r.rack) ||
      !Number.isSafeInteger(r.startedAt) ||
      r.startedAt < 0 ||
      !Number.isSafeInteger(r.readyAt) ||
      r.readyAt <= r.startedAt ||
      r.readyAt - r.startedAt > 300000 ||
      ids.has(r.id)
    )
      return false;
    ids.add(r.id);
    return true;
  });
}
export type ServiceSession = {
  id: string;
  stage: 'reading' | 'repair' | 'test' | 'complete';
  version: number;
  nextAt: number;
  fault: number;
};
export const COMMISSIONING_CHECKS = [
  {
    reading: 'Network: no link. Power: steady. Temperature: normal.',
    answer: 'Reseat the network cable',
  },
  {
    reading: 'Network: connected. Power: breaker open. Temperature: normal.',
    answer: 'Reset the breaker',
  },
  {
    reading:
      'Network: connected. Power: steady. Temperature: rising; intake blocked.',
    answer: 'Clear the intake filter',
  },
] as const;

/** Only already-authorized finite machine runs can complete through a read. */
export async function finalizeProjectWork(
  db: D1Database,
  id: string,
  now: number,
) {
  for (let retry = 0; retry < 3; retry++) {
    const row = await db
      .prepare(
        "SELECT version,progress_json,required_json FROM cluster_projects WHERE id=? AND state='open' AND work_version=1",
      )
      .bind(id)
      .first<{
        version: number;
        progress_json: string;
        required_json: string;
      }>();
    if (!row) return;
    const due = await db
      .prepare(
        "SELECT count(*) AS n,max(ready_at) AS last FROM cluster_contributions WHERE project_id=? AND state='pending' AND ready_at<=?",
      )
      .bind(id, now)
      .first<{ n: number; last: number }>();
    if (!due?.n) return;
    const progress = JSON.parse(row.progress_json),
      required = JSON.parse(row.required_json);
    progress.workload += due.n;
    const complete = ['service', 'supply', 'workload'].every(
      (k) => progress[k] >= required[k],
    );
    const result = await db.batch([
      db
        .prepare(
          "UPDATE cluster_projects SET progress_json=?,version=version+1,state=?,completed_at=? WHERE id=? AND state='open' AND version=?",
        )
        .bind(
          JSON.stringify(progress),
          complete ? 'completed' : 'open',
          complete ? now : null,
          id,
          row.version,
        ),
      db
        .prepare(
          "UPDATE cluster_contributions SET state='complete' WHERE project_id=? AND state='pending' AND ready_at<=? AND changes()=1",
        )
        .bind(id, now),
    ]);
    if (result[0].meta.changes === 1) return;
  }
}
