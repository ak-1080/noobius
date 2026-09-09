import { realmWriteGuard, type RealmPermit } from './realm-authority.ts';
import {
  decodeDispatchBenefit,
  dispatchCount,
  grantDispatchChoices,
} from './dispatch.ts';
import { availableRacks, careerFor, type ContractFamily } from './contracts.ts';
import {
  newFacility,
  normalizeFacility,
  settleFacilityProduction,
  type ItemId,
} from './facility.ts';
import {
  COMMISSIONING_CHECKS,
  finalizeProjectWork,
  projectLoanQuote,
  type CommissioningWork,
  type ServiceSession,
} from './commissioning.ts';
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
  work_version: number;
  version: number;
  created_at: number;
  completed_at: number | null;
};
const decode = (p: ProjectRow): Project => ({
  workVersion: p.work_version,
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
  const unfinished = (
    await db
      .prepare(
        "SELECT DISTINCT p.id FROM cluster_projects p LEFT JOIN cluster_contributions c ON c.project_id=p.id WHERE p.state='open' AND (p.neighborhood_id=? OR c.wallet=?)",
      )
      .bind(presence.neighborhood_id, wallet)
      .all<{ id: string }>()
  ).results;
  for (const project of unfinished)
    await finalizeProjectWork(db, project.id, now);
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
            "SELECT p.name,c.family,sum(c.units) AS units,sum(CASE WHEN c.state='pending' THEN c.units ELSE 0 END) AS pending,(c.wallet=?) AS mine FROM cluster_contributions c JOIN players p ON p.wallet=c.wallet WHERE project_id=? GROUP BY c.wallet,c.family",
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
  const workloads = row
    ? (
        await db
          .prepare(
            "SELECT p.name,(c.wallet=?) AS mine,c.work_json FROM cluster_contributions c JOIN players p ON p.wallet=c.wallet WHERE project_id=? AND state='pending'",
          )
          .bind(wallet, row.id)
          .all<{ name: string; mine: boolean; work_json: string }>()
      ).results.map((r) => ({
        ...(JSON.parse(r.work_json) as CommissioningWork),
        name: r.name,
        mine: !!r.mine,
      }))
    : [];
  const service = row
    ? await db
        .prepare(
          "SELECT id,stage,fault,next_at AS nextAt,version FROM cluster_service_sessions WHERE project_id=? AND wallet=? AND stage!='complete'",
        )
        .bind(row.id, wallet)
        .first<ServiceSession>()
    : null;
  return {
    project: row ? { ...decode(row), pendingWorkload: workloads.length } : null,
    workloads,
    service,
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
  const existing = await db
    .prepare(
      "SELECT id FROM cluster_projects WHERE neighborhood_id=? AND state='open'",
    )
    .bind(presence.neighborhood_id)
    .first<{ id: string }>();
  if (existing) await finalizeProjectWork(db, existing.id, now);
  await db
    .prepare(`INSERT OR IGNORE INTO cluster_projects(id,neighborhood_id,variant,state,scale,required_json,progress_json,benefit_json,work_version,version,created_at)
    SELECT ?,?,?,'open',?,?,?,?,1,0,? WHERE EXISTS(SELECT 1 FROM crew_presence WHERE wallet=? AND client_id=? AND generation=? AND neighborhood_id=? AND lease_until>? AND ${realmWriteGuard('crew_presence', permit)})`)
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
  work?: { rack?: string; serviceId?: string; serviceVersion?: number },
) {
  if (!uuid(id) || !uuid(requestId) || !PROJECT_FAMILIES.includes(family))
    return fail('Choose a contribution.', 400);
  const previous = await db
    .prepare(
      'SELECT wallet,project_id,family,work_json FROM cluster_contributions WHERE id=?',
    )
    .bind(requestId)
    .first<{
      wallet: string;
      project_id: string;
      family: string;
      work_json: string | null;
    }>();
  if (previous) {
    if (
      previous.wallet !== wallet ||
      previous.project_id !== id ||
      previous.family !== family ||
      (previous.work_json && JSON.parse(previous.work_json).rack !== work?.rack)
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
  const pending = await db
    .prepare(
      "SELECT count(*) AS n FROM cluster_contributions WHERE project_id=? AND state='pending'",
    )
    .bind(id)
    .first<{ n: number }>();
  if (project.progress[family] >= project.required[family])
    return fail('That part is complete. Choose another useful job.');
  let loan: CommissioningWork | null = null;
  let service: ServiceSession | null = null;
  if (project.workVersion === 1 && family === 'service') {
    service = work?.serviceId
      ? await db
          .prepare(
            'SELECT id,stage,fault,next_at AS nextAt,version FROM cluster_service_sessions WHERE id=? AND project_id=? AND wallet=?',
          )
          .bind(work.serviceId, id, wallet)
          .first<ServiceSession>()
      : null;
    if (
      !service ||
      service.stage !== 'test' ||
      service.nextAt > now ||
      service.version !== work?.serviceVersion
    )
      return fail(
        'Inspect, repair and test this cluster before contributing service.',
        400,
      );
  }
  if (project.workVersion === 1 && family === 'workload') {
    if (
      project.progress.workload + (pending?.n ?? 0) >=
      project.required.workload
    )
      return fail(
        'All commissioning runs are already assigned. Help with service or supplies.',
      );
    if (
      typeof work?.rack !== 'string' ||
      !availableRacks(f, now).includes(work.rack)
    )
      return fail(
        'Choose an available machine for this commissioning run.',
        400,
      );
    settleFacilityProduction(f, now);
    const quote = projectLoanQuote(f, work.rack);
    loan = {
      id: requestId,
      projectId: id,
      rack: work.rack,
      startedAt: now,
      readyAt: now + quote.duration * 1000,
      version: 1,
      ...quote,
    };
    f.projectReservations = [
      ...(f.projectReservations ?? []),
      {
        id: requestId,
        projectId: id,
        rack: work.rack,
        startedAt: now,
        readyAt: loan.readyAt,
      },
    ];
  }
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
  if (!loan) project.progress[family]++;
  const complete = PROJECT_FAMILIES.every(
    (k) => project.progress[k] >= project.required[k],
  );
  const result = await db.batch([
    db
      .prepare(`UPDATE cluster_projects SET progress_json=?,version=version+1,state=?,completed_at=? WHERE id=? AND version=? AND state='open'
      AND NOT EXISTS(SELECT 1 FROM cluster_contributions WHERE id=?)
      AND EXISTS(SELECT 1 FROM players WHERE wallet=? AND facility_version=?)
      ${service ? "AND EXISTS(SELECT 1 FROM cluster_service_sessions WHERE id=? AND version=? AND stage='test' AND next_at<=?)" : ''}
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
        ...(service ? [service.id, service.version, now] : []),
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
        'INSERT INTO cluster_contributions(id,project_id,wallet,family,units,state,ready_at,work_json,created_at) SELECT ?,?,?,?,1,?,?,?,? WHERE changes()=1',
      )
      .bind(
        requestId,
        id,
        wallet,
        family,
        loan ? 'pending' : 'complete',
        loan?.readyAt ?? null,
        loan ? JSON.stringify(loan) : null,
        now,
      ),
    ...(service
      ? [
          db
            .prepare(
              "UPDATE cluster_service_sessions SET stage='complete',version=version+1 WHERE id=? AND changes()=1",
            )
            .bind(service.id),
        ]
      : []),
  ]);
  if (result[0].meta.changes !== 1)
    return fail(
      'Your crew just made progress. Refresh and choose what is still needed.',
    );
}
// Service attempts consume no materials until a successful final test. An
// abandoned attempt cannot reserve a project slot or prevent solo completion.
export async function startProjectService(
  db: D1Database,
  wallet: string,
  controller: Controller,
  id: string,
  requestId: string,
  now = Date.now(),
  permit?: RealmPermit,
) {
  if (!uuid(id) || !uuid(requestId))
    return fail('Choose a cluster inspection.', 400);
  const previous = await db
    .prepare(
      'SELECT project_id,wallet FROM cluster_service_sessions WHERE id=?',
    )
    .bind(requestId)
    .first<{ project_id: string; wallet: string }>();
  if (previous) {
    if (previous.project_id !== id || previous.wallet !== wallet)
      return fail('Use a new inspection request.');
    return;
  }
  const presence = await requireMembership(db, wallet, controller, now);
  const row = await db
    .prepare(
      "SELECT * FROM cluster_projects WHERE id=? AND neighborhood_id=? AND state='open' AND work_version=1",
    )
    .bind(id, presence.neighborhood_id)
    .first<ProjectRow>();
  if (!row) return fail('Choose an active commissioning project.');
  const project = decode(row);
  if (project.progress.service >= project.required.service)
    return fail('Service checks are already complete.');
  const { f } = await account(db, wallet, now);
  if (
    !reportsAvailable(
      f.career!,
      'service',
      projectReportStyle(project.variant, 'service'),
    )
  )
    return fail('Finish and claim an eligible service job first.', 400);
  const fault =
    crypto.getRandomValues(new Uint32Array(1))[0] % COMMISSIONING_CHECKS.length;
  const result = await db
    .prepare(`INSERT OR IGNORE INTO cluster_service_sessions(id,project_id,wallet,stage,fault,next_at,version)
    SELECT ?,?,?,'reading',?,?,0 WHERE EXISTS(SELECT 1 FROM cluster_projects WHERE id=? AND version=? AND state='open')
    AND EXISTS(SELECT 1 FROM crew_presence WHERE wallet=? AND neighborhood_id=? AND client_id=? AND generation=? AND lease_until>? AND updated_at>? AND room='commons' AND (x+4)*(x+4)+(z-9)*(z-9)<=16 AND ${realmWriteGuard('crew_presence', permit)})`)
    .bind(
      requestId,
      id,
      wallet,
      fault,
      now + 3000,
      id,
      project.version,
      wallet,
      presence.neighborhood_id,
      controller.clientId,
      controller.generation,
      now,
      now - 10000,
    )
    .run();
  if (result.meta.changes !== 1) {
    const active = await db
      .prepare(
        "SELECT id FROM cluster_service_sessions WHERE project_id=? AND wallet=? AND stage!='complete'",
      )
      .bind(id, wallet)
      .first();
    if (!active)
      return fail('Meet Margo in the plaza and refresh the project.', 409);
  }
}
export async function advanceProjectService(
  db: D1Database,
  wallet: string,
  controller: Controller,
  projectId: string,
  id: string,
  version: number,
  step: string,
  choice: unknown,
  now = Date.now(),
  permit?: RealmPermit,
) {
  if (
    !uuid(id) ||
    !uuid(projectId) ||
    !Number.isSafeInteger(version) ||
    !['inspect', 'repair', 'test'].includes(step)
  )
    return fail('Refresh the inspection controls.', 400);
  const session = await db
    .prepare(
      'SELECT id,stage,fault,next_at AS nextAt,version FROM cluster_service_sessions WHERE id=? AND project_id=? AND wallet=?',
    )
    .bind(id, projectId, wallet)
    .first<ServiceSession>();
  if (!session) return fail('Start an inspection for this project.');
  if (step === 'test' && session.stage === 'complete') return;
  if (session.version !== version || session.nextAt > now)
    return fail('The readings are still updating. Wait, then try again.');
  if (step === 'test') {
    await contributeProject(
      db,
      wallet,
      controller,
      projectId,
      'service',
      id,
      now,
      permit,
      { serviceId: id, serviceVersion: version },
    );
    return;
  }
  const expected = step === 'inspect' ? 'reading' : 'repair';
  if (session.stage !== expected)
    return fail('Follow the current inspection step.');
  const correct =
    step === 'inspect' || choice === COMMISSIONING_CHECKS[session.fault].answer;
  const next = step === 'inspect' ? 'repair' : correct ? 'test' : 'repair';
  const presence = await requireMembership(db, wallet, controller, now);
  const result = await db
    .prepare(`UPDATE cluster_service_sessions SET stage=?,next_at=?,version=version+1 WHERE id=? AND version=?
    AND EXISTS(SELECT 1 FROM cluster_projects WHERE id=? AND neighborhood_id=? AND state='open' AND CAST(json_extract(progress_json,'$.service') AS INTEGER)<CAST(json_extract(required_json,'$.service') AS INTEGER))
    AND EXISTS(SELECT 1 FROM crew_presence WHERE wallet=? AND neighborhood_id=? AND client_id=? AND generation=? AND lease_until>? AND updated_at>? AND room='commons' AND (x+4)*(x+4)+(z-9)*(z-9)<=16 AND ${realmWriteGuard('crew_presence', permit)})`)
    .bind(
      next,
      now + (next === 'test' ? 6000 : 3000),
      id,
      version,
      projectId,
      presence.neighborhood_id,
      wallet,
      presence.neighborhood_id,
      controller.clientId,
      controller.generation,
      now,
      now - 10000,
    )
    .run();
  if (result.meta.changes !== 1)
    return fail('Your crew or position changed. Meet Margo and refresh.');
  return correct
    ? 'Readings recorded. Continue the check.'
    : 'That repair does not match the readings. Review them and try again.';
}

export async function claimProject(
  db: D1Database,
  wallet: string,
  id: string,
  now = Date.now(),
) {
  if (!uuid(id)) return fail('Choose a completed cluster.', 400);
  await finalizeProjectWork(db, id, now);
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
