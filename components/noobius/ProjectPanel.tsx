'use client';
import { useEffect, useState } from 'react';
import { ArrowRight, Check, Cpu, Package, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { COMMISSIONING_CHECKS, projectLoanQuote } from '@/lib/commissioning';
import {
  careerFor,
  availableRacks,
  type ContractFamily,
  type ModuleStyle,
} from '@/lib/contracts';
import {
  ITEMS,
  OBJECTS,
  type Facility,
  type ItemId,
  type Bag,
} from '@/lib/facility';
import {
  PROJECT_FAMILIES,
  PROJECT_INPUTS,
  PROJECT_VARIANTS,
  reportsAvailable,
  projectVariantsFor,
  projectReportStyle,
  projectBenefitFor,
  previewProjectReport,
  type ProjectSnapshot,
} from '@/lib/projects';
import { api } from './useNoobius';
import type { RealmId } from '@/lib/neighborhoods';
import { dispatchCount, dispatchGrantCount } from '@/lib/dispatch';
const styleLabel = (style: string) => style[0].toUpperCase() + style.slice(1);
const LABELS = { service: 'Service', supply: 'Supply', workload: 'Workload' },
  ICONS = { service: Wrench, supply: Package, workload: Cpu };
export default function ProjectPanel({
  facility,
  realm,
  connected,
  neighborhoodId,
  busy,
  onAction,
  onWalk,
  onJobs,
  atMargo,
  onParts,
  onResume,
  onOutage,
}: {
  facility: Facility;
  realm: RealmId;
  connected: boolean;
  neighborhoodId?: string;
  busy: boolean;
  onAction: (action: string, body: Record<string, unknown>) => Promise<unknown>;
  onWalk: () => void;
  onJobs: (family: ContractFamily, style?: ModuleStyle) => void;
  atMargo: boolean;
  onParts: (parts: Bag) => void;
  onResume: (realm: RealmId, neighborhoodId: string) => void;
  onOutage: () => void;
}) {
  const [data, setData] = useState<ProjectSnapshot | null>(null),
    [error, setError] = useState(''),
    [saving, setSaving] = useState(false);
  const [historyPages, setHistoryPages] = useState<(string | null)[]>([null]),
    [historyLoading, setHistoryLoading] = useState(false);
  const historyCursor = historyPages.at(-1) ?? null;
  const [now, setNow] = useState(Date.now),
    [rack, setRack] = useState('');
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!connected) {
      setData(null);
      setHistoryPages([null]);
      return;
    }
    let alive = true,
      pending = false;
    const refresh = async () => {
      if (pending || document.hidden) return;
      pending = true;
      setHistoryLoading(true);
      try {
        const next = await api<ProjectSnapshot>(
          'projects' +
            (historyCursor
              ? '?historyCursor=' + encodeURIComponent(historyCursor)
              : ''),
        );
        if (alive) {
          setData(next);
          setError('');
        }
      } catch (e) {
        if (alive)
          setError(
            e instanceof Error ? e.message : 'Could not load this project.',
          );
      } finally {
        pending = false;
        if (alive) setHistoryLoading(false);
      }
    };
    void refresh();
    const timer = setInterval(refresh, 4000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [connected, neighborhoodId, busy, historyCursor]);
  const perform = async (action: string, body: Record<string, unknown>) => {
    setSaving(true);
    setError('');
    try {
      const result = await onAction(action, body);
      if (!result) return;
      setHistoryPages([null]);
      setData(await api<ProjectSnapshot>('projects'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Try again.');
    } finally {
      setSaving(false);
    }
  };
  if (!connected)
    return <p>Join a neighborhood to commission a cluster with your crew.</p>;
  if (!data)
    return <p role="status">{error || 'Opening the project board…'}</p>;
  const project = data.project,
    career = careerFor(facility),
    disabled = busy || saving;
  const variant = PROJECT_VARIANTS.find((v) => v.id === project?.variant);
  const remaining = project
    ? PROJECT_FAMILIES.reduce(
        (sum, f) => sum + project.required[f] - project.progress[f],
        0,
      )
    : 0;
  return (
    <section className="cluster-project">
      <div className="cluster-project-heading">
        <Cpu size={32} />
        <div>
          <span>THE NEIGHBORHOOD PROJECT</span>
          <h3>{project ? variant?.name : 'Commission a cluster'}</h3>
        </div>
      </div>
      <p>
        {project
          ? variant?.description
          : 'Turn your completed jobs into a shared build. Anyone can help with any part.'}
      </p>
      {project?.workVersion === 1 && (
        <p className="job-note">
          Deliver parts, test the cluster and lend a machine.
        </p>
      )}
      {(!project || project.state === 'completed') && (
        <div className="project-start-options">
          {project && (
            <div className="project-complete">
              <Check /> Cluster online. Built by your crew.
            </div>
          )}
          <div className="project-choice-grid">
            {projectVariantsFor(realm).map((v) => (
              <article className="project-choice" key={v.id}>
                <h4>{v.name}</h4>
                <p>{v.description}</p>
                {projectBenefitFor(v.id) && (
                  <p className="dispatch-benefit">
                    Each {projectBenefitFor(v.id)!.family} contribution earns
                    one job choice on collection. Store up to two; use them to
                    pick an unlocked job.
                  </p>
                )}
                {PROJECT_FAMILIES.map((family) => {
                  const style = projectReportStyle(v.id, family);
                  return style ? (
                    <strong key={family}>
                      {styleLabel(style)} {family} jobs required
                    </strong>
                  ) : null;
                })}
                <Button
                  disabled={disabled}
                  onClick={() =>
                    void perform('project-start', { variant: v.id })
                  }
                >
                  {project ? 'Start another' : 'Start project'}{' '}
                  <ArrowRight size={16} />
                </Button>
              </article>
            ))}
          </div>
          <small>
            The work is set when you start. You can finish alone, even if
            neighbors leave.
          </small>
        </div>
      )}
      {project?.state === 'open' && (
        <>
          <div className="project-progress">
            <strong>
              {remaining === (project.pendingWorkload ?? 0)
                ? 'Your assigned machines are finishing the cluster'
                : `${remaining - (project.pendingWorkload ?? 0)} contributions still needed`}
            </strong>
            <Progress
              value={
                (100 *
                  PROJECT_FAMILIES.reduce(
                    (sum, f) => sum + project.progress[f],
                    0,
                  )) /
                PROJECT_FAMILIES.reduce(
                  (sum, f) => sum + project.required[f],
                  0,
                )
              }
            />
          </div>
          {PROJECT_FAMILIES.map((family) => {
            const Icon = ICONS[family],
              style = projectReportStyle(project.variant, family),
              reports = reportsAvailable(career, family, style),
              proof = previewProjectReport(career, family, style),
              cost = PROJECT_INPUTS[family],
              hasParts = Object.entries(cost).every(
                ([id, n]) => (facility.inventory[id as ItemId] ?? 0) >= n!,
              ),
              pending =
                family === 'workload' ? (project.pendingWorkload ?? 0) : 0,
              complete = project.progress[family] >= project.required[family],
              done =
                project.progress[family] + pending >= project.required[family],
              racks = availableRacks(facility, now),
              quote = racks.includes(rack)
                ? projectLoanQuote(facility, rack)
                : null,
              service = data.service,
              wait = service
                ? Math.max(0, Math.ceil((service.nextAt - now) / 1000))
                : 0;
            return (
              <article
                className={`project-role ${complete ? 'complete' : done ? 'running' : ''}`}
                key={family}
              >
                <header>
                  <Icon size={21} />
                  <strong>{LABELS[family]}</strong>
                  <span>
                    {project.progress[family]}/{project.required[family]}
                    {pending > 0 && ` · ${pending} running`}
                  </span>
                </header>
                {done ? (
                  <p>
                    {complete
                      ? 'Contribution complete.'
                      : 'All required machines are assigned. Their runs finish automatically.'}
                  </p>
                ) : (
                  <p>
                    {reports > 0
                      ? `✓ ${style ? styleLabel(style) + ' job' : 'Job'} completed`
                      : `Finish and claim a ${style ? styleLabel(style) + ' ' : ''}${family} job`}{' '}
                    ·{' '}
                    {Object.entries(cost)
                      .map(
                        ([id, n]) =>
                          `${Math.min(n!, facility.inventory[id as ItemId] ?? 0)}/${n} ${ITEMS[id as ItemId].name}`,
                      )
                      .join(' + ')}
                  </p>
                )}
                {style && !done && (
                  <small>
                    Choose {styleLabel(style)} before starting the job. Changing
                    equipment afterward does not change its receipt.
                  </small>
                )}
                {project.benefit?.family === family && (
                  <small className="dispatch-benefit">
                    This contribution can earn one {family} job choice when you
                    collect. You currently store {dispatchCount(career, family)}
                    /2. Claiming with full storage adds none.
                  </small>
                )}
                {!style &&
                  proof &&
                  proof !== 'legacy' &&
                  proof !== 'standard' &&
                  !done && (
                    <small>
                      This contribution uses one completed {styleLabel(proof)}{' '}
                      job.
                    </small>
                  )}
                {data.contributions.filter((c) => c.family === family).length >
                  0 && (
                  <small>
                    {data.contributions
                      .filter((c) => c.family === family)
                      .map((c) => `${c.mine ? 'You' : c.name} ×${c.units}`)
                      .join(' · ')}
                  </small>
                )}
                {!done && (
                  <div className="project-role-actions">
                    {reports < 1 ? (
                      <Button
                        variant="outline"
                        onClick={() => onJobs(family, style)}
                      >
                        Choose {style ? styleLabel(style) + ' ' : 'a '}
                        {family} job
                      </Button>
                    ) : !hasParts ? (
                      <Button variant="outline" onClick={() => onParts(cost)}>
                        Find missing parts
                      </Button>
                    ) : !atMargo ? (
                      <Button onClick={onWalk}>
                        Meet Margo <ArrowRight size={16} />
                      </Button>
                    ) : project.workVersion === 1 && family === 'service' ? (
                      <div className="commissioning-check">
                        {!service ? (
                          <Button
                            disabled={disabled}
                            onClick={() =>
                              void perform('project-inspect', {
                                projectId: project.id,
                              })
                            }
                          >
                            Inspect the cluster
                          </Button>
                        ) : (
                          <>
                            <strong>
                              {service.stage === 'reading'
                                ? 'Scanning the cluster'
                                : service.stage === 'repair'
                                  ? 'What do the readings tell you?'
                                  : 'Repair applied. Verify it.'}
                            </strong>
                            {service.stage !== 'reading' && (
                              <p>
                                {COMMISSIONING_CHECKS[service.fault].reading}
                              </p>
                            )}
                            {wait > 0 && (
                              <p role="status">
                                {service.stage === 'test'
                                  ? 'Stabilizing'
                                  : 'Checking'}{' '}
                                · {wait}s
                              </p>
                            )}
                            {service.stage === 'repair' ? (
                              <div className="commissioning-repairs">
                                {COMMISSIONING_CHECKS.map((check) => (
                                  <Button
                                    key={check.answer}
                                    variant="outline"
                                    disabled={disabled || wait > 0}
                                    onClick={() =>
                                      void perform('project-service', {
                                        projectId: project.id,
                                        sessionId: service.id,
                                        version: service.version,
                                        step: 'repair',
                                        choice: check.answer,
                                      })
                                    }
                                  >
                                    {check.answer}
                                  </Button>
                                ))}
                              </div>
                            ) : (
                              <Button
                                disabled={disabled || wait > 0}
                                onClick={() =>
                                  void perform('project-service', {
                                    projectId: project.id,
                                    sessionId: service.id,
                                    version: service.version,
                                    step:
                                      service.stage === 'reading'
                                        ? 'inspect'
                                        : 'test',
                                  })
                                }
                              >
                                {service.stage === 'reading'
                                  ? 'Read diagnostics'
                                  : 'Test & deliver service'}
                              </Button>
                            )}
                          </>
                        )}
                        <small>
                          Your service report and kit are used only after a
                          successful test.
                        </small>
                      </div>
                    ) : project.workVersion === 1 && family === 'workload' ? (
                      <div className="commissioning-check">
                        <label>
                          Choose a machine to lend
                          <NativeSelect
                            aria-label="Commissioning machine"
                            value={rack}
                            onChange={(e) => setRack(e.target.value)}
                          >
                            <NativeSelectOption value="">
                              Select an available machine
                            </NativeSelectOption>
                            {racks.map((id) => {
                              const q = projectLoanQuote(facility, id);
                              return (
                                <NativeSelectOption key={id} value={id}>
                                  {OBJECTS.find((o) => o.id === id)?.name} ·{' '}
                                  {q.duration}s · pauses {q.pausedOutput}{' '}
                                  Compute
                                </NativeSelectOption>
                              );
                            })}
                          </NativeSelect>
                        </label>
                        {quote ? (
                          <p>
                            Process 20 commissioning packets in {quote.duration}
                            s. This reserves the whole machine and pauses{' '}
                            {quote.pausedOutput} Compute of ordinary output.
                            Your other machines keep working.
                          </p>
                        ) : (
                          <p>
                            {racks.length
                              ? 'A bigger machine finishes sooner. A smaller one leaves your larger machine free for client batches.'
                              : 'No machines are available. Collect finished client results in Jobs, wait for an active run, or build a machine in your center.'}
                          </p>
                        )}
                        <Button
                          disabled={disabled || !quote}
                          onClick={() =>
                            void perform('project-contribute', {
                              projectId: project.id,
                              family,
                              rack,
                            })
                          }
                        >
                          Assign machine & supplies
                        </Button>
                        <small>
                          The run finishes automatically. No cancellation or
                          manual pickup; the machine is free at the deadline.
                        </small>
                      </div>
                    ) : (
                      <Button
                        disabled={disabled}
                        onClick={() =>
                          void perform('project-contribute', {
                            projectId: project.id,
                            family,
                          })
                        }
                      >
                        Contribute <ArrowRight size={16} />
                      </Button>
                    )}
                  </div>
                )}
              </article>
            );
          })}
          {!!data.workloads?.length && (
            <div className="commissioning-runs">
              <h4>Machines commissioning</h4>
              {data.workloads.map((run) => (
                <article key={run.id}>
                  <strong>
                    {run.mine ? 'You' : run.name} ·{' '}
                    {OBJECTS.find((o) => o.id === run.rack)?.name}
                  </strong>
                  <p>
                    {now < run.readyAt
                      ? `${Math.ceil((run.readyAt - now) / 1000)}s remaining`
                      : 'Finalizing the completed run…'}{' '}
                    · capacity {run.capacity}
                  </p>
                  <Progress
                    value={Math.min(
                      100,
                      Math.max(
                        0,
                        (100 * (now - run.startedAt)) /
                          (run.readyAt - run.startedAt),
                      ),
                    )}
                  />
                </article>
              ))}
            </div>
          )}
          <p className="project-reward-rule">
            Each contribution earns 100 Compute + 20 reputation when the cluster
            is complete. Parts are used when delivered. No time limit.
          </p>
        </>
      )}
      {(data.history.length > 0 || historyPages.length > 1) && (
        <div className="project-history">
          <h4>Your builds</h4>
          {!data.history.length && (
            <p>
              No builds remain on this page. Check the latest rewards and active
              builds.
            </p>
          )}
          {data.history.map((p) => (
            <div key={p.id}>
              <span>
                <strong>
                  {PROJECT_VARIANTS.find((v) => v.id === p.variant)?.name}
                </strong>
                <small>
                  {p.units} contribution{p.units === 1 ? '' : 's'} ·{' '}
                  {p.claimed
                    ? 'Collected'
                    : p.state === 'completed'
                      ? `${p.units * 100} Compute ready`
                      : 'Your crew is still building'}
                </small>
                {!p.claimed && p.benefit && (
                  <small className="dispatch-benefit">
                    On collection: +
                    {dispatchGrantCount(
                      career,
                      p.benefit,
                      p.dispatchUnits ?? 0,
                    )}{' '}
                    {p.benefit.family} job choices ·{' '}
                    {dispatchCount(career, p.benefit.family)}/2 stored now.
                    {dispatchCount(career, p.benefit.family) >= 2
                      ? ' Use a choice before collecting to make room. Collecting now forfeits the overflow.'
                      : ''}
                  </small>
                )}
              </span>
              {!p.claimed &&
                p.benefit &&
                dispatchCount(career, p.benefit.family) > 0 && (
                  <button
                    className="text-action"
                    onClick={() => onJobs(p.benefit!.family)}
                  >
                    Use saved choices <ArrowRight size={16} />
                  </button>
                )}
              {p.state === 'open' && p.neighborhoodId !== neighborhoodId && (
                <Button
                  variant="outline"
                  disabled={disabled}
                  onClick={() => onResume(p.realm, p.neighborhoodId)}
                >
                  Resume project
                </Button>
              )}
              {!p.claimed && p.state === 'completed' && (
                <Button
                  disabled={disabled}
                  onClick={() =>
                    void perform('project-claim', { projectId: p.id })
                  }
                >
                  Collect
                </Button>
              )}
            </div>
          ))}
          {(historyPages.length > 1 || data.historyNextCursor) && (
            <nav aria-label="Project history pages">
              <Button
                variant="outline"
                disabled={
                  disabled || historyLoading || historyPages.length === 1
                }
                onClick={() => setHistoryPages((pages) => pages.slice(0, -1))}
              >
                Previous builds
              </Button>
              <Button
                variant="outline"
                disabled={disabled || historyLoading || !data.historyNextCursor}
                onClick={() => {
                  if (data.historyNextCursor)
                    setHistoryPages((pages) => [
                      ...pages,
                      data.historyNextCursor!,
                    ]);
                }}
              >
                More builds
              </Button>
              {historyPages.length > 1 && (
                <button
                  className="text-action"
                  onClick={() => setHistoryPages([null])}
                >
                  Latest rewards and active builds
                </button>
              )}
            </nav>
          )}
          {historyLoading && <output>Updating your builds…</output>}
        </div>
      )}
      <button className="text-action" onClick={onOutage}>
        Looking for a quick team repair? <ArrowRight size={16} />
      </button>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
