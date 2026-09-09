import { realmWriteGuard, type RealmPermit } from './realm-authority.ts';
import {
  decodeDispatchBenefit,
  dispatchCount,
  grantDispatchChoices,
} from './dispatch.ts';
import { careerFor, type ContractFamily } from './contracts.ts';
import { newFacility, normalizeFacility, type ItemId } from './facility.ts';
import {
  NeighborhoodError,
  requireMembership,
  type Controller,
} from './neighborhoods-server.ts';
import {
  PROJECT_INPUTS,
  PROJECT_FAMILIES,
  projectVariantsFor,
  projectBenefitFor,
  projectReportStyle,
  reportsAvailable,
  consumeProjectReport,
  type Project,
  type ProjectSnapshot,
} from './projects.ts';

type ProjectRow = {
  id: string;
  neighborhood_id: string;
  variant: string;
  state: 'open' | 'completed';
  scale: number;
  required_json: string;
  progress_json: string;
  benefit_json: string | null;
  version: number;
  created_at: number;
  completed_at: number | null;
};
const decode = (p: ProjectRow): Project => ({
  benefit: decodeDispatchBenefit(p.benefit_json),
  id: p.id,
  neighborhoodId: p.neighborhood_id,
  variant: p.variant,
  state: p.state,
  scale: p.scale,
  required: JSON.parse(p.required_json),
  progress: JSON.parse(p.progress_json),
  version: p.version,
  createdAt: p.created_at,
  completedAt: p.completed_at,
});
const empty = () => ({ service: 0, supply: 0, workload: 0 });
const uuid = (id: string) => /^[a-f0-9-]{36}$/.test(id);
const fail = (message: string, status = 409): never => {
  throw new NeighborhoodError(status, message);
};
async function account(db: D1Database, wallet: string, now: number) {
  const p = await db
    .prepare(
      'SELECT facility_state,facility_version,credits FROM players WHERE wallet=?',
    )
    .bind(wallet)
    .first<{
      facility_state: string;
      facility_version: number;
      credits: number;
    }>();
  if (!p) return fail('Reconnect your wallet.', 401);
  const f = normalizeFacility(
    {
      ...JSON.parse(p.facility_state || JSON.stringify(newFacility(now))),
      version: p.facility_version,
      compute: p.credits,
    },
    now,
  );
  f.career = careerFor(f);
  return { p, f };
}
export async function projectSnapshot(
  db: D1Database,
  wallet: string,
  now = Date.now(),
): Promise<ProjectSnapshot> {
  const presence = await requireMembership(db, wallet, undefined, now);
  const row = await db
    .prepare(
      "SELECT * FROM cluster_projects WHERE neighborhood_id=? ORDER BY (state='open') DESC,created_at DESC,id DESC LIMIT 1",
    )
    .bind(presence.neighborhood_id)
    .first<ProjectRow>();
  const contributions = row
    ? (
        await db
          .prepare(
            'SELECT p.name,c.family,sum(c.units) AS units,(c.wallet=?) AS mine FROM cluster_contributions c JOIN players p ON p.wallet=c.wallet WHERE project_id=? GROUP BY c.wallet,c.family',
          )
          .bind(wallet, row.id)
          .all<{
            name: string;
            family: ContractFamily;
            units: number;
            mine: boolean;
          }>()
      ).results
    : [];
  const history = (
    await db
      .prepare(`SELECT p.id,p.neighborhood_id AS neighborhoodId,n.realm,p.variant,p.state,p.benefit_json AS benefitJson,sum(c.units) AS units,
    sum(CASE WHEN c.family='service' THEN c.units ELSE 0 END) AS service,
    sum(CASE WHEN c.family='supply' THEN c.units ELSE 0 END) AS supply,
    sum(CASE WHEN c.family='workload' THEN c.units ELSE 0 END) AS workload,
    EXISTS(SELECT 1 FROM cluster_claims claimed WHERE claimed.project_id=p.id AND claimed.wallet=?) AS claimed
    FROM cluster_contributions c JOIN cluster_projects p ON p.id=c.project_id JOIN neighborhoods n ON n.id=p.neighborhood_id WHERE c.wallet=? GROUP BY p.id ORDER BY (p.state='completed' AND NOT EXISTS(SELECT 1 FROM cluster_claims done WHERE done.project_id=p.id AND done.wallet=c.wallet)) DESC,p.created_at ASC,p.id ASC LIMIT 30`)
      .bind(wallet, wallet)
      .all<{
        id: string;
        neighborhoodId: string;
        realm: 'commons' | 'gpu';
        variant: string;
        state: string;
        units: number;
        claimed: boolean;
        benefitJson: string | null;
        service: number;
        supply: number;
        workload: number;
      }>()
  ).results;
  return {
    project: row ? decode(row) : null,
    contributions: contributions.map((c) => ({ ...c, mine: !!c.mine })),
    history: history.map(({ benefitJson, service, supply, workload, ...p }) => {
      const benefit = decodeDispatchBenefit(benefitJson);
      return {
        ...p,
        claimed: !!p.claimed,
        benefit,
        dispatchUnits: benefit
          ? { service, supply, workload }[benefit.family]
          : 0,
      };
    }),
  };
}
export async function startProject(
  db: D1Database,
  wallet: string,
  controller: Controller,
  variant: string,
  now = Date.now(),
  permit?: RealmPermit,
) {
  const presence = await requireMembership(db, wallet, controller, now);
  if (!presence.realm)
    return fail('Join a neighborhood before starting a project.', 409);
  const template = projectVariantsFor(presence.realm).find(
    (v) => v.id === variant,
  );
  if (!template) return fail('Choose a project available in this realm.', 403);
  const neighbors = await db
    .prepare(
      'SELECT count(*) AS n FROM crew_presence WHERE neighborhood_id=? AND lease_until>?',
    )
    .bind(presence.neighborhood_id, now)
    .first<{ n: number }>();
  const scale = Math.min(3, Math.max(1, Math.ceil((neighbors?.n ?? 1) / 2)));
  const required = { service: scale, supply: scale, workload: scale };
  if (template.extra) required[template.extra]++;
  await db
    .prepare(`INSERT OR IGNORE INTO cluster_projects(id,neighborhood_id,variant,state,scale,required_json,progress_json,benefit_json,version,created_at)
    SELECT ?,?,?,'open',?,?,?,?,0,? WHERE EXISTS(SELECT 1 FROM crew_presence WHERE wallet=? AND client_id=? AND generation=? AND neighborhood_id=? AND lease_until>? AND ${realmWriteGuard('crew_presence', permit)})`)
    .bind(
      crypto.randomUUID(),
      presence.neighborhood_id,
      variant,
      scale,
      JSON.stringify(required),
      JSON.stringify(empty()),
      projectBenefitFor(variant)
        ? JSON.stringify(projectBenefitFor(variant))
        : null,
      now,
      wallet,
      controller.clientId,
      controller.generation,
      presence.neighborhood_id,
      now,
    )
    .run();
  await requireMembership(db, wallet, controller, now);
  const authorized = await db
    .prepare(
      `SELECT 1 FROM crew_presence WHERE wallet=? AND ${realmWriteGuard('crew_presence', permit)}`,
    )
    .bind(wallet)
    .first();
  if (!authorized)
    return fail(
      'Your realm access changed. Rejoin Crew Commons to continue.',
      403,
    );
  return projectSnapshot(db, wallet, now);
}
export async function contributeProject(
  db: D1Database,
  wallet: string,
  controller: Controller,
  id: string,
  family: ContractFamily,
  requestId: string,
  now = Date.now(),
  permit?: RealmPermit,
) {
  if (!uuid(id) || !uuid(requestId) || !PROJECT_FAMILIES.includes(family))
    return fail('Choose a contribution.', 400);
  const previous = await db
    .prepare(
      'SELECT wallet,project_id,family FROM cluster_contributions WHERE id=?',
    )
    .bind(requestId)
    .first<{ wallet: string; project_id: string; family: string }>();
  if (previous) {
    if (
      previous.wallet !== wallet ||
      previous.project_id !== id ||
      previous.family !== family
    )
      return fail('Use a new contribution request.');
    return;
  }
  const presence = await requireMembership(db, wallet, controller, now);
  const row = await db
    .prepare('SELECT * FROM cluster_projects WHERE id=? AND neighborhood_id=?')
    .bind(id, presence.neighborhood_id)
    .first<ProjectRow>();
  if (!row || row.state !== 'open')
    return fail(
      'That cluster is already complete or belongs to another neighborhood.',
    );
  if (
    presence.room !== 'commons' ||
    presence.updated_at < now - 10000 ||
    Math.hypot(presence.x + 4, presence.z - 9) > 4
  )
    return fail('Meet Margo in the plaza to contribute.', 400);
  const project = decode(row),
    { p, f } = await account(db, wallet, now),
    career = f.career!;
  if (project.progress[family] >= project.required[family])
    return fail('That part is complete. Choose another useful job.');
  // The persisted variant decides proof requirements. Legacy projects retain
  // their original IDs/requirements, and equipping a module is never proof of work.
  const reportStyle = projectReportStyle(project.variant, family);
  const missingReport =
    'Finish a ' +
    (reportStyle
      ? reportStyle.charAt(0).toUpperCase() + reportStyle.slice(1) + ' '
      : '') +
    family +
    ' job first. Each completed job can support one contribution.';
  if (reportsAvailable(career, family, reportStyle) < 1)
    return fail(missingReport, 400);
  for (const [key, n] of Object.entries(PROJECT_INPUTS[family]))
    if ((f.inventory[key as ItemId] ?? 0) < n!)
      return fail('Gather or craft the missing components first.', 400);
  for (const [key, n] of Object.entries(PROJECT_INPUTS[family]))
    f.inventory[key as ItemId] = (f.inventory[key as ItemId] ?? 0) - n!;
  if (!consumeProjectReport(career, family, reportStyle))
    return fail(missingReport, 400);
  f.version++;
  project.progress[family]++;
  const complete = PROJECT_FAMILIES.every(
    (k) => project.progress[k] >= project.required[k],
  );
  const result = await db.batch([
    db
      .prepare(`UPDATE cluster_projects SET progress_json=?,version=version+1,state=?,completed_at=? WHERE id=? AND version=? AND state='open'
      AND NOT EXISTS(SELECT 1 FROM cluster_contributions WHERE id=?)
      AND EXISTS(SELECT 1 FROM players WHERE wallet=? AND facility_version=?)
      AND EXISTS(SELECT 1 FROM crew_presence WHERE wallet=? AND neighborhood_id=? AND client_id=? AND generation=? AND lease_until>? AND updated_at>? AND room='commons' AND (x+4)*(x+4)+(z-9)*(z-9)<=16 AND ${realmWriteGuard('crew_presence', permit)})`)
      .bind(
        JSON.stringify(project.progress),
        complete ? 'completed' : 'open',
        complete ? now : null,
        id,
        project.version,
        requestId,
        wallet,
        p.facility_version,
        wallet,
        presence.neighborhood_id,
        controller.clientId,
        controller.generation,
        now,
        now - 10000,
      ),
    db
      .prepare(
        'UPDATE players SET facility_state=?,facility_version=? WHERE wallet=? AND changes()=1',
      )
      .bind(JSON.stringify(f), f.version, wallet),
    db
      .prepare(
        'INSERT INTO cluster_contributions(id,project_id,wallet,family,units,created_at) SELECT ?,?,?,?,1,? WHERE changes()=1',
      )
      .bind(requestId, id, wallet, family, now),
  ]);
  if (result[0].meta.changes !== 1)
    return fail(
      'Your crew just made progress. Refresh and choose what is still needed.',
    );
}
export async function claimProject(
  db: D1Database,
  wallet: string,
  id: string,
  now = Date.now(),
) {
  if (!uuid(id)) return fail('Choose a completed cluster.', 400);
  const row = await db
    .prepare(
      `SELECT p.variant,p.benefit_json,sum(c.units) AS units,
      EXISTS(SELECT 1 FROM cluster_claims claimed WHERE claimed.project_id=p.id AND claimed.wallet=c.wallet) AS claimed,
      sum(CASE WHEN c.family='service' THEN c.units ELSE 0 END) AS service,
      sum(CASE WHEN c.family='supply' THEN c.units ELSE 0 END) AS supply,
      sum(CASE WHEN c.family='workload' THEN c.units ELSE 0 END) AS workload
      FROM cluster_projects p JOIN cluster_contributions c ON c.project_id=p.id WHERE p.id=? AND p.state='completed' AND c.wallet=? GROUP BY p.id`,
    )
    .bind(id, wallet)
    .first<{
      variant: string;
      claimed: boolean;
      units: number;
      benefit_json: string | null;
      service: number;
      supply: number;
      workload: number;
    }>();
  if (!row) return fail('Contribute to a completed cluster before collecting.');
  if (row.claimed) return fail('This reward was already collected.');
  const { p, f } = await account(db, wallet, now),
    career = f.career!,
    compute = row.units * 100,
    reputation = row.units * 20;
  const benefit = decodeDispatchBenefit(row.benefit_json);
  const granted = grantDispatchChoices(
    career,
    benefit,
    id,
    benefit ? row[benefit.family] : 0,
  );
  career.reputation += reputation;
  career.commissioned = (career.commissioned ?? 0) + 1;
  career.projectDiscoveries ??= [];
  if (!career.projectDiscoveries.includes(row.variant))
    career.projectDiscoveries.push(row.variant);
  f.compute += compute;
  f.stats.computeEarned = (f.stats.computeEarned ?? 0) + compute;
  f.daily.computeEarned = (f.daily.computeEarned ?? 0) + compute;
  f.version++;
  const result = await db.batch([
    db
      .prepare(
        `INSERT OR IGNORE INTO cluster_claims(id,project_id,wallet,compute,reputation,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM players WHERE wallet=? AND facility_version=?)`,
      )
      .bind(
        crypto.randomUUID(),
        id,
        wallet,
        compute,
        reputation,
        now,
        wallet,
        p.facility_version,
      ),
    db
      .prepare(
        'UPDATE players SET credits=credits+?,xp=xp+?,facility_state=?,facility_version=? WHERE wallet=? AND changes()=1',
      )
      .bind(compute, reputation, JSON.stringify(f), f.version, wallet),
  ]);
  if (result[0].meta.changes !== 1)
    return fail(
      'This reward was already collected or your center changed. Refresh to check.',
    );
  return {
    compute,
    reputation,
    ...(benefit
      ? {
          dispatch: {
            family: benefit.family,
            granted,
            stored: dispatchCount(career, benefit.family),
          },
        }
      : {}),
  };
}
