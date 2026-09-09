'use client';

import {
  ArrowRight,
  Check,
  Clock3,
  Cpu,
  Gauge,
  Navigation,
  Package,
  ShieldCheck,
  Sparkles,
  Wrench,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { Progress } from '@/components/ui/progress';
import {
  ITEMS,
  OBJECTS,
  canPay,
  type Facility,
  type FacilityAction,
  type Bag,
  type ItemId,
} from '@/lib/facility';
import {
  availableRacks,
  careerFor,
  careerLevel,
  completedContracts,
  contractQuote,
  contractTemplate,
  MODULES,
  CONTRACT_TEMPLATES,
  masteryStamps,
  operatorLicense,
  SERVICE_REPAIRS,
  serviceChallenge,
  type ContractRun,
  type ContractFamily,
  type ModuleStyle,
} from '@/lib/contracts';
import ItemIcon from './ItemIcon';
import ComputeIcon from './ComputeIcon';
import GoalsPanel from './GoalsPanel';

type Action = (action: Omit<FacilityAction, 'requestId'>) => Promise<unknown>;
export type JobDraft = { style: ModuleStyle; rack: string };
type Props = {
  focusFamily?: ContractFamily;
  onClearFocus?: () => void;
  onProject?: () => void;
  drafts?: Record<string, JobDraft>;
  onDraft?: (id: string, draft: JobDraft) => void;
  position: { x: number; z: number };
  facility: Facility;
  now: number;
  busy: boolean;
  onAction: Action;
  onParts: (items: Bag) => void;
  onGuide: (id: string) => void;
  onBuild: () => void;
  onLocker: () => void;
  onGold: () => void;
};
const familyCopy = {
  service: { title: 'Service', Icon: Wrench },
  supply: { title: 'Supply', Icon: Package },
  workload: { title: 'Client workload', Icon: Cpu },
};
const styleName = (style: ModuleStyle) =>
  style === 'standard' ? 'Standard' : MODULES.find((m) => m.id === style)!.name;
function Materials({ cost, f }: { cost: Bag; f: Facility }) {
  return (
    <div className="job-materials">
      {Object.entries(cost).map(([id, quantity]) => (
        <span
          key={id}
          className={
            (f.inventory[id as ItemId] ?? 0) < quantity! ? 'missing' : ''
          }
        >
          <ItemIcon item={id as ItemId} size={18} />
          {quantity} {ITEMS[id as ItemId].name}
          <small>
            {Math.min(quantity!, f.inventory[id as ItemId] ?? 0)}/{quantity}
          </small>
        </span>
      ))}
    </div>
  );
}

function ActiveJob({ run, ...props }: Props & { run: ContractRun }) {
  const { facility: f, now, busy, onAction, onParts, onGuide } = props;
  const c = careerFor(f),
    t = contractTemplate(run.template),
    { Icon } = familyCopy[t.family];
  const draft = props.drafts?.[run.id] ?? {
    style: 'standard' as ModuleStyle,
    rack: '',
  };
  const chosenStyle = draft.style,
    chosenRack = draft.rack;
  const setStyle = (style: ModuleStyle) =>
    props.onDraft?.(run.id, { ...draft, style });
  const setRack = (rack: string) => props.onDraft?.(run.id, { ...draft, rack });
  const style = c.loadout.includes(chosenStyle) ? chosenStyle : 'standard';
  const racks = availableRacks(f),
    rack = racks.includes(chosenRack) ? chosenRack : racks[0];
  const quote = contractQuote(f, t, style, rack, now);
  const worksite = OBJECTS.find((o) => o.id === t.target)!;
  const atWorksite =
    t.family === 'workload' ||
    Math.hypot(props.position.x - worksite.x, props.position.z - worksite.z) <=
      4;
  const ready =
    run.state === 'ready' || (run.readyAt !== null && now >= run.readyAt);
  const waiting = Math.max(
    0,
    Math.ceil(
      ((t.family === 'service' ? run.nextStepAt : (run.readyAt ?? now)) - now) /
        1000,
    ),
  );
  const progress = ready
    ? 100
    : t.family === 'service'
      ? run.steps * 25
      : run.startedAt !== null && run.readyAt !== null
        ? Math.max(
            0,
            Math.min(
              100,
              ((now - run.startedAt) / (run.readyAt - run.startedAt)) * 100,
            ),
          )
        : 0;
  return (
    <article
      className={`client-job active-client-job ${ready ? 'is-ready' : ''}`}
    >
      <div className="job-eyebrow">
        <span>
          <Icon size={16} />
          {familyCopy[t.family].title}
        </span>
        <span>
          {ready ? (
            <>
              <Check size={15} /> Payment ready
            </>
          ) : run.state === 'accepted' ? (
            'Getting ready'
          ) : (
            <>
              <Clock3 size={15} /> In progress
            </>
          )}
        </span>
      </div>
      <h3>{t.name}</h3>
      <p>{t.goal}</p>
      {run.state === 'accepted' ? (
        <>
          <Materials cost={quote.cost} f={f} />
          <div className="job-configuration">
            <label>
              Equipment
              <NativeSelect
                aria-label={`Equipment for ${t.name}`}
                value={style}
                onChange={(e) => setStyle(e.target.value as ModuleStyle)}
              >
                <NativeSelectOption value="standard">
                  Standard
                </NativeSelectOption>
                {c.loadout.map((s) => (
                  <NativeSelectOption key={s} value={s}>
                    {styleName(s)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </label>
            {t.family === 'workload' && (
              <label>
                Reserve a machine
                <NativeSelect
                  aria-label={`Machine for ${t.name}`}
                  value={rack ?? ''}
                  onChange={(e) => setRack(e.target.value)}
                >
                  {racks.length ? (
                    racks.map((id) => (
                      <NativeSelectOption key={id} value={id}>
                        {OBJECTS.find((o) => o.id === id)?.name ?? id}
                      </NativeSelectOption>
                    ))
                  ) : (
                    <NativeSelectOption value="">
                      No machine available
                    </NativeSelectOption>
                  )}
                </NativeSelect>
              </label>
            )}
          </div>
          <div className="job-payout">
            <span>
              <ComputeIcon size={20} /> {quote.reward} Compute
            </span>
            <span>+{quote.reputation} reputation</span>
            {quote.duration > 0 && (
              <span>
                <Clock3 size={15} />
                {quote.duration}s
              </span>
            )}
          </div>
          {t.family === 'workload' && (
            <p className="job-note">
              This machine pauses its ordinary production during the batch. The
              client payment includes that output.
            </p>
          )}
          <div className="job-actions">
            {!canPay(f.inventory, quote.cost) ? (
              <Button
                className="primary-action"
                onClick={() => onParts(quote.cost)}
              >
                Find missing parts <Navigation size={16} />
              </Button>
            ) : !atWorksite ? (
              <Button
                className="primary-action"
                onClick={() => onGuide(t.target)}
              >
                Go to the worksite <Navigation size={16} />
              </Button>
            ) : (
              <Button
                className="primary-action"
                disabled={busy || (t.family === 'workload' && !rack)}
                onClick={() =>
                  void onAction({
                    type: 'contract-start',
                    id: run.id,
                    direction: style,
                    rack,
                  })
                }
              >
                {t.family === 'supply'
                  ? 'Deliver parts'
                  : t.family === 'service'
                    ? 'Begin repair'
                    : 'Start workload'}{' '}
                <ArrowRight size={16} />
              </Button>
            )}
            {t.family !== 'workload' && !canPay(f.inventory, quote.cost) && (
              <Button
                className="outline-button"
                onClick={() => onGuide(t.target)}
              >
                Show worksite
              </Button>
            )}
            <button
              className="text-action"
              disabled={busy}
              onClick={() =>
                void onAction({ type: 'contract-cancel', id: run.id })
              }
            >
              Cancel unstarted job
            </button>
          </div>
        </>
      ) : (
        <>
          <Progress value={progress} aria-label={`${t.name} progress`} />
          {t.family === 'service' && !ready && (
            <div className="service-diagnostics">
              <div className="service-sequence">
                {['Inspect', 'Diagnose', 'Test'].map((step, i) => (
                  <span
                    key={step}
                    className={
                      i < run.steps ? 'done' : i === run.steps ? 'current' : ''
                    }
                  >
                    {i < run.steps ? <Check size={14} /> : i + 1} {step}
                  </span>
                ))}
              </div>
              {run.steps === 1 && (
                <>
                  <ul>
                    {serviceChallenge(run).readings.map((reading) => (
                      <li key={reading}>{reading}</li>
                    ))}
                  </ul>
                  <p>
                    {c.completed.service < 2
                      ? serviceChallenge(run).hint
                      : 'What do these readings tell you?'}
                  </p>
                </>
              )}
            </div>
          )}
          <div className="job-payout">
            <span>
              <ComputeIcon size={20} /> {run.reward} Compute
            </span>
            <span>+{run.reputation} reputation</span>
          </div>
          {ready ? (
            <Button
              className="primary-action"
              disabled={busy}
              onClick={() =>
                void onAction({ type: 'contract-claim', id: run.id })
              }
            >
              Collect payment <Check size={17} />
            </Button>
          ) : t.family === 'service' && !atWorksite ? (
            <Button
              className="primary-action"
              onClick={() => onGuide(t.target)}
            >
              Return to the worksite <Navigation size={16} />
            </Button>
          ) : t.family === 'service' ? (
            <div className="service-choices">
              {(run.steps === 1
                ? SERVICE_REPAIRS
                : [run.steps === 0 ? 'Inspect' : 'Test']
              ).map((choice) => (
                <Button
                  key={choice}
                  className={
                    run.steps === 1 ? 'outline-button' : 'primary-action'
                  }
                  disabled={busy || waiting > 0}
                  onClick={() =>
                    void onAction({
                      type: 'contract-service',
                      id: run.id,
                      direction: choice,
                    })
                  }
                >
                  {waiting > 0 && run.steps !== 1
                    ? `System settling · ${waiting}s`
                    : choice}{' '}
                  <Wrench size={16} />
                </Button>
              ))}
              {waiting > 0 && run.steps === 1 && (
                <small>Reading sensors · {waiting}s</small>
              )}
            </div>
          ) : (
            <p className="job-note">
              <Clock3 size={16} />
              {waiting}s remaining.{' '}
              {t.family === 'supply'
                ? 'Your delivery is being checked. You can take another job.'
                : 'You can take another job while this rack works.'}
            </p>
          )}
        </>
      )}
      <button
        className="job-track"
        disabled={busy}
        onClick={() => void onAction({ type: 'contract-track', id: run.id })}
      >
        {c.selected === run.id ? <Check size={14} /> : <Navigation size={14} />}
        {c.selected === run.id ? 'Tracked on your screen' : 'Track this job'}
      </button>
    </article>
  );
}

export function ModuleWorkshop({
  facility: f,
  busy,
  onAction,
}: Pick<Props, 'facility' | 'busy' | 'onAction'>) {
  const career = careerFor(f),
    count = completedContracts(career);
  return (
    <div className="module-workshop">
      <div className="job-section-heading">
        <div>
          <small>MAKE IT YOURS</small>
          <h3>Your equipment</h3>
        </div>
        <span>{career.loadout.length}/2 modules equipped</span>
      </div>
      <p className="job-note">
        Build a module, equip it, then choose it when starting a job. Switching
        your loadout is free.
      </p>
      <div className="module-grid">
        {MODULES.map((m) => {
          const owned = career.modules.includes(m.id),
            equipped = career.loadout.includes(m.id),
            learned = count >= m.required;
          return (
            <article
              className={`module-card ${equipped ? 'equipped' : ''}`}
              key={m.id}
            >
              <span className="module-symbol">
                {m.id === 'fast' ? (
                  <Gauge size={28} />
                ) : m.id === 'stable' ? (
                  <ShieldCheck size={28} />
                ) : (
                  <Sparkles size={28} />
                )}
              </span>
              <h4>{m.name}</h4>
              <p>{m.description}</p>
              {!owned && (
                <>
                  <Materials cost={m.cost} f={f} />
                  <small>
                    {learned
                      ? 'Blueprint learned'
                      : `${count}/${m.required} jobs to learn`}{' '}
                    · {m.price} Compute
                  </small>
                </>
              )}
              <Button
                className={equipped ? 'primary-action' : 'outline-button'}
                disabled={
                  busy ||
                  (!owned &&
                    (!learned ||
                      f.compute < m.price ||
                      !canPay(f.inventory, m.cost)))
                }
                onClick={() =>
                  void onAction({
                    type: owned ? 'module-equip' : 'module-build',
                    id: m.id,
                  })
                }
              >
                {owned
                  ? equipped
                    ? 'Equipped · remove'
                    : 'Equip module'
                  : learned
                    ? 'Build module'
                    : 'Keep completing jobs'}
              </Button>
            </article>
          );
        })}
      </div>
    </div>
  );
}

export default function JobsPanel(props: Props) {
  const { facility: f, now, busy, onAction, onBuild, onLocker, onGold } = props,
    c = careerFor(f),
    licensed = operatorLicense(c);
  return (
    <div className="jobs-board">
      {props.focusFamily && (
        <div className="job-focus">
          <strong>Your cluster needs a {props.focusFamily} job.</strong>
          <p>Complete one, then return to the project with its parts.</p>
          <button className="text-action" onClick={props.onClearFocus}>
            Show all jobs
          </button>
        </div>
      )}
      <div className="career-strip">
        <span className="career-badge">
          <ShieldCheck size={24} />
        </span>
        <div>
          <strong>
            {licensed ? 'Licensed operator' : 'Your operating license'}
          </strong>
          <span>
            Level {careerLevel(c)} · {c.reputation} reputation ·{' '}
            {completedContracts(c)} jobs completed
          </span>
          <span className={(c.commissioned ?? 0) > 0 ? 'done' : ''}>
            {Math.min(1, c.commissioned ?? 0)}/1 cluster commissioned
          </span>
        </div>
      </div>
      <Tabs defaultValue="board">
        <TabsList className="jobs-tabs">
          <TabsTrigger value="board">Job board</TabsTrigger>
          <TabsTrigger value="equipment">Equipment</TabsTrigger>
          <TabsTrigger value="progress">Milestones</TabsTrigger>
        </TabsList>
        <TabsContent value="board">
          <div className="job-section-heading">
            <h3>Your work</h3>
            <span>{c.active.length}/2 different jobs accepted</span>
          </div>
          {c.active.length ? (
            <div className="active-jobs">
              {c.active
                .filter(
                  (run) =>
                    !props.focusFamily ||
                    contractTemplate(run.template).family === props.focusFamily,
                )
                .map((run) => (
                  <ActiveJob key={run.id} {...props} run={run} />
                ))}
            </div>
          ) : (
            <div className="jobs-empty">
              <Wrench size={24} />
              <div>
                <strong>Your next shift is up to you.</strong>
                <p>
                  Choose a job below. Gather supplies, put your machines to work
                  and make something useful.
                </p>
              </div>
            </div>
          )}
          <div className="job-section-heading">
            <h3>Pick your next job</h3>
            <span>Fresh offers after each completed job</span>
          </div>
          <div className="job-offers">
            {c.offers
              .filter(
                (o) =>
                  !props.focusFamily ||
                  contractTemplate(o.template).family === props.focusFamily,
              )
              .map((o) => {
                const t = contractTemplate(o.template),
                  { Icon, title } = familyCopy[t.family];
                return (
                  <article className="client-job" key={o.id}>
                    <div className="job-eyebrow">
                      <span>
                        <Icon size={16} />
                        {title}
                      </span>
                      <span>
                        {t.seconds ? `${t.seconds}s work` : 'Craft & deliver'}
                      </span>
                    </div>
                    <small className="job-client">{t.client}</small>
                    <h3>{t.name}</h3>
                    <p>{t.description}</p>
                    <Materials cost={t.cost} f={f} />
                    <div className="job-payout">
                      <span>
                        <ComputeIcon size={20} />
                        {t.reward}
                        {t.family === 'workload' ? '+' : ''}
                      </span>
                      <span>+{t.reputation} reputation</span>
                    </div>
                    <Button
                      className="outline-button"
                      disabled={
                        busy ||
                        c.active.some((r) => r.id === o.id) ||
                        c.active.length >= 2 ||
                        (t.family === 'workload' &&
                          !Object.values(f.builds).some((v) => v > 0))
                      }
                      onClick={() =>
                        void onAction({ type: 'contract-accept', id: o.id })
                      }
                    >
                      {c.active.some((r) => r.id === o.id)
                        ? 'Accepted'
                        : 'Accept job'}{' '}
                      <ArrowRight size={16} />
                    </Button>
                  </article>
                );
              })}
          </div>
          <div className="license-progress">
            <strong>
              {licensed
                ? 'Operator license earned'
                : 'Earn your Operator license'}
            </strong>
            <p>
              Complete two jobs of each kind, build a module and commission a
              neighborhood cluster. Your equipment and savings stay yours as you
              progress.
            </p>
            <div>
              {(['service', 'supply', 'workload'] as const).map((family) => (
                <span
                  key={family}
                  className={c.completed[family] >= 2 ? 'done' : ''}
                >
                  {Math.min(2, c.completed[family])}/2{' '}
                  {familyCopy[family].title}
                </span>
              ))}
              <span className={c.modules.length ? 'done' : ''}>
                {Math.min(1, c.modules.length)}/1 module built
              </span>
              <span className={(c.commissioned ?? 0) > 0 ? 'done' : ''}>
                {Math.min(1, c.commissioned ?? 0)}/1 cluster commissioned
              </span>
            </div>
            <button className="text-action" onClick={props.onProject}>
              Open neighborhood project <ArrowRight size={16} />
            </button>
          </div>
        </TabsContent>
        <TabsContent value="equipment">
          <ModuleWorkshop facility={f} busy={busy} onAction={onAction} />
        </TabsContent>
        <TabsContent value="progress">
          <div className="mastery-collection">
            <h3>Master your equipment</h3>
            <p>
              {masteryStamps(c)}/36 stamps. Finish each kind of job using Fast,
              Efficient and Stable modules.
            </p>
            <div className="mastery-grid">
              {CONTRACT_TEMPLATES.map((t) => (
                <div key={t.id}>
                  <strong>{t.name}</strong>
                  <span>
                    {(['fast', 'efficient', 'stable'] as const).map((style) => (
                      <i
                        key={style}
                        title={style}
                        className={
                          (c.mastery?.[t.id]?.[style] ?? 0) > 0 ? 'earned' : ''
                        }
                      >
                        {(c.mastery?.[t.id]?.[style] ?? 0) > 0 ? '✓' : '○'}{' '}
                        {style}
                      </i>
                    ))}
                  </span>
                </div>
              ))}
            </div>
            <h4>Your center display</h4>
            <p>
              Six stamps unlock room colors. Eighteen stamps and three
              commissioned clusters unlock a trophy.
            </p>
            <div className="project-role-actions">
              {(['original', 'mint', 'violet'] as const).map((id) => (
                <Button
                  key={id}
                  disabled={busy || (id !== 'original' && masteryStamps(c) < 6)}
                  onClick={() => void onAction({ type: 'module-decor', id })}
                >
                  {id === (c.accent ?? 'original') ? '✓ ' : ''}
                  {id}
                </Button>
              ))}
              <Button
                disabled={
                  busy || masteryStamps(c) < 18 || (c.commissioned ?? 0) < 3
                }
                onClick={() =>
                  void onAction({ type: 'module-decor', id: 'trophy' })
                }
              >
                {c.trophy ? 'Hide trophy' : 'Display trophy'}
              </Button>
            </div>
          </div>
          <div className="license-progress">
            <strong>Blueprint collection</strong>
            <p>
              {c.discoveries.length}/12 kinds of work completed. More jobs
              remain after every machine is upgraded.
            </p>
          </div>
          <GoalsPanel
            facility={f}
            now={now}
            busy={busy}
            onAction={onAction}
            onBuild={onBuild}
            onLocker={onLocker}
            onGold={onGold}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
