'use client';
import { useEffect, useState } from 'react';
import { ArrowRight, Check, Cpu, Package, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  careerFor,
  type ContractFamily,
  type ModuleStyle,
} from '@/lib/contracts';
import { ITEMS, type Facility, type ItemId, type Bag } from '@/lib/facility';
import {
  PROJECT_FAMILIES,
  PROJECT_INPUTS,
  PROJECT_VARIANTS,
  reportsAvailable,
  projectVariantsFor,
  projectReportStyle,
  previewProjectReport,
  type ProjectSnapshot,
} from '@/lib/projects';
import { api } from './useNoobius';
import type { RealmId } from '@/lib/neighborhoods';
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
  useEffect(() => {
    if (!connected) {
      setData(null);
      return;
    }
    let alive = true,
      pending = false;
    const refresh = async () => {
      if (pending || document.hidden) return;
      pending = true;
      try {
        const next = await api<ProjectSnapshot>('projects');
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
      }
    };
    void refresh();
    const timer = setInterval(refresh, 4000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [connected, neighborhoodId, busy]);
  const perform = async (action: string, body: Record<string, unknown>) => {
    setSaving(true);
    setError('');
    try {
      const result = await onAction(action, body);
      if (!result) return;
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
            <strong>{remaining} contributions to bring it online</strong>
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
              done = project.progress[family] >= project.required[family];
            return (
              <article
                className={`project-role ${done ? 'complete' : ''}`}
                key={family}
              >
                <header>
                  <Icon size={21} />
                  <strong>{LABELS[family]}</strong>
                  <span>
                    {project.progress[family]}/{project.required[family]}
                  </span>
                </header>
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
                {style && (
                  <small>
                    Choose {styleLabel(style)} before starting the job. Changing
                    equipment afterward does not change its receipt.
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
                    ) : (
                      <Button
                        disabled={disabled}
                        onClick={() =>
                          void perform('project-contribute', {
                            projectId: project.id,
                            family,
                            requestId: crypto.randomUUID(),
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
          <p className="project-reward-rule">
            Each contribution earns 100 Compute + 20 reputation when the cluster
            is complete. Parts are used when delivered. No time limit.
          </p>
        </>
      )}
      {data.history.length > 0 && (
        <div className="project-history">
          <h4>Your builds</h4>
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
              </span>
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
        </div>
      )}
      <button className="text-action" onClick={onOutage}>
        Looking for a quick team repair? <ArrowRight size={16} />
      </button>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
