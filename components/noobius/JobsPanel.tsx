'use client';
import { useState } from 'react';

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
  workloadCapacity,
  machinePerTick,
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
  eligibleContracts,
  contractFor,
  MODULES,
  CONTRACT_TEMPLATES,
  masteryStamps,
  operatorLicense,
  SERVICE_REPAIRS,
  serviceChallenge,
  type ContractRun,
  type ContractOffer,
  type ContractFamily,
  type ModuleStyle,
} from '@/lib/contracts';
import ItemIcon from './ItemIcon';
import ComputeIcon from './ComputeIcon';
import GoalsPanel from './GoalsPanel';
import {
  careerSuggestions,
  jobSelection,
  jobSetup,
  usefulStyles,
} from '@/lib/job-choices';
import type { NextStep } from '@/lib/objectives';
import { dispatchCount } from '@/lib/dispatch';
import PersonalGoals from './PersonalGoals';
import type { PersonalGoalsController } from './usePersonalGoals';

type Action = (action: Omit<FacilityAction, 'requestId'>) => Promise<unknown>;
export type JobDraft = { style: ModuleStyle; rack: string; quantity?: number };
type Props = {
  personalGoals?: PersonalGoalsController;
  initialTab?: string;
  practice?: boolean;
  focusReason?: 'project' | 'goal';
  onPlan: (step: NextStep) => void;
  onEquipment?: () => void;
  focusFamily?: ContractFamily;
  focusStyle?: ModuleStyle;
  onClearFocus?: () => void;
  onProject?: () => void;
  drafts?: Record<string, JobDraft>;
  onDraft?: (id: string, draft: JobDraft) => void;
  position: { x: number; z: number };
  facility: Facility;
  now: number;
  busy: boolean;
  onAction: Action;
  onParts: (
    items: Bag,
    source?: import('@/lib/objectives').PartsRequest['source'],
  ) => void;
  focusJobId?: string;
  onGuide: (id: string, jobId: string) => void;
  onBuild: () => void;
  onLocker: () => void;
  onGold: () => void;
};
const familyCopy = {
  service: { title: 'Repair jobs', Icon: Wrench },
  supply: { title: 'Parts orders', Icon: Package },
  workload: { title: 'Computing jobs', Icon: Cpu },
};
const styleName = (style: ModuleStyle) =>
  style === 'standard' ? 'Standard' : MODULES.find((m) => m.id === style)!.name;
function JobOffer({
  offer,
  facility: f,
  busy,
  onAction,
  onBuild,
  onReview,
}: Pick<Props, 'facility' | 'busy' | 'onAction' | 'onBuild'> & {
  offer: ContractOffer;
  onReview: () => void;
}) {
  const c = careerFor(f),
    original = contractFor(offer);
  const [chosen, setChosen] = useState(offer.template);
  const options = eligibleContracts(c, f, original.family);
  const changed = chosen !== offer.template;
  const selected = changed ? options.find((t) => t.id === chosen) : original;
  const tickets = c.dispatchChoices?.[original.family] ?? [];
  const accepted = c.active.some((run) => run.id === offer.id);
  const { Icon, title } = familyCopy[original.family];
  if (!selected)
    return (
      <article className="client-job">
        <p>This job choice is no longer available.</p>
        <Button
          className="outline-button"
          onClick={() => setChosen(offer.template)}
        >
          Return to your saved offer
        </Button>
      </article>
    );
  const preview = jobSetup(f, selected, 'standard');
  return (
    <article className="client-job">
      <div className="job-eyebrow">
        <span>
          <Icon size={16} />
          {title}
        </span>
        <span>
          {selected.seconds ? `${selected.seconds}s work` : 'Craft & deliver'}
        </span>
      </div>
      {tickets.length > 0 && !accepted && (
        <label className="dispatch-picker">
          {tickets.length} job choice{tickets.length === 1 ? '' : 's'} saved
          <NativeSelect
            aria-label={`Choose a ${original.family} job`}
            value={chosen}
            onChange={(event) => setChosen(event.target.value)}
            disabled={busy}
          >
            <NativeSelectOption value={original.id}>
              Keep this offer · no choice used
            </NativeSelectOption>
            {options
              .filter((t) => t.id !== original.id)
              .map((t) => (
                <NativeSelectOption key={t.id} value={t.id}>
                  {t.name} · {t.seconds}s
                </NativeSelectOption>
              ))}
          </NativeSelect>
        </label>
      )}
      <small className="job-client">{selected.client}</small>
      <h3>{selected.name}</h3>
      <p>{selected.goal}</p>
      <small className="job-requirement-label">Parts you’ll use</small>
      {!changed &&
        (offer.termsVersion ?? 1) === 1 &&
        ['cooling-call', 'field-stock'].includes(offer.template) && (
          <small>Saved offer · original parts and reward</small>
        )}
      <Materials cost={selected.cost} f={f} />
      <div className="job-payout">
        <span>
          <ComputeIcon size={20} />
          {preview.fee} Compute
          {selected.family === 'workload' ? ' per one-unit job' : ' reward'}
        </span>
        <span>+{selected.reputation} reputation</span>
        <span>+1 job report</span>
      </div>
      {changed && (
        <p className="dispatch-benefit">
          Accepting uses one {original.family} job choice. Canceling later keeps
          this offer and does not return the choice. Configure your equipment
          after accepting.
        </p>
      )}
      <Button
        className="outline-button"
        disabled={
          busy ||
          accepted ||
          c.active.length >= 2 ||
          (original.family === 'workload' &&
            !Object.values(f.builds).some((v) => v > 0)) ||
          (changed && (!tickets[0] || !options.some((t) => t.id === chosen)))
        }
        onClick={() =>
          void onAction({
            type: 'contract-accept',
            id: offer.id,
            ...(changed
              ? { template: chosen, dispatchTicket: tickets[0] }
              : {}),
          })
        }
      >
        {accepted
          ? 'Accepted'
          : changed
            ? 'Use 1 choice & accept'
            : 'Accept job'}{' '}
        <ArrowRight size={16} />
      </Button>
      {!accepted && c.active.length >= 2 ? (
        <button className="text-action" onClick={onReview}>
          Both slots are full. Review your current work ↑
        </button>
      ) : !accepted &&
        original.family === 'workload' &&
        !Object.values(f.builds).some((n) => n > 0) ? (
        <button className="text-action" onClick={onBuild}>
          Build your first machine to take this job →
        </button>
      ) : null}
    </article>
  );
}
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
    t = contractFor(run),
    { Icon } = familyCopy[t.family];
  const draft = props.drafts?.[run.id] ?? {
    style:
      props.focusFamily === t.family &&
      props.focusStyle &&
      c.loadout.includes(props.focusStyle)
        ? props.focusStyle
        : ('standard' as ModuleStyle),
    rack: '',
  };
  const chosenStyle = draft.style,
    chosenRack = draft.rack;
  const setStyle = (style: ModuleStyle) =>
    props.onDraft?.(run.id, { ...draft, style });
  const setRack = (rack: string) => props.onDraft?.(run.id, { ...draft, rack });
  const { style, styleAvailable, rack } = jobSelection(
    f,
    chosenStyle,
    chosenRack,
    now,
  );
  const racks = availableRacks(f, now);
  const batchEnabled = t.family === 'workload' && run.quoteVersion === 2;
  const quantity = batchEnabled ? (draft.quantity ?? 1) : 1;
  const batchLimit = rack ? workloadCapacity(f, rack) : 1;
  const batchFits = !batchEnabled || !rack || quantity <= batchLimit;
  const quote = jobSetup(
    f,
    t,
    style,
    rack,
    now,
    quantity,
    run.quoteVersion ?? 1,
  );
  const prepareParts = () => {
    props.onDraft?.(run.id, { style, rack: rack ?? '', quantity });
    onParts(quote.cost, {
      label: t.name,
      panel: 'contracts',
      view: { jobsTab: 'board', jobId: run.id },
    });
  };
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
      {props.focusJobId === run.id && <p className="job-note">Selected job</p>}
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
      {props.focusFamily &&
        props.focusFamily !== t.family &&
        c.active.length >= 2 && (
          <p className="job-note">
            This job uses one of your two slots. Finish it or cancel it before
            starting another kind of work.
          </p>
        )}
      {props.focusFamily === t.family &&
        props.focusStyle &&
        (run.state === 'accepted' ? style : run.style) !== props.focusStyle && (
          <p className="job-note">
            {run.state === 'accepted'
              ? `This goal uses ${styleName(props.focusStyle)} equipment. Choose it before starting this job.`
              : `This job started with ${styleName(run.style)} equipment. It still earns its normal rewards; start a ${styleName(props.focusStyle)} job for that goal.`}
          </p>
        )}
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
                {!styleAvailable && (
                  <NativeSelectOption value={style} disabled>
                    {styleName(style)} · not equipped
                  </NativeSelectOption>
                )}
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
                  <NativeSelectOption value="">
                    {!racks.length
                      ? 'No machine available'
                      : chosenRack && !rack
                        ? 'Previous machine unavailable — choose another'
                        : 'Choose a machine'}
                  </NativeSelectOption>
                  {racks.length > 0 &&
                    racks.map((id) => (
                      <NativeSelectOption key={id} value={id}>
                        {OBJECTS.find((o) => o.id === id)?.name ?? id} · level{' '}
                        {f.builds[id]}
                        {batchEnabled
                          ? ` · up to ${workloadCapacity(f, id)} units`
                          : ''}
                      </NativeSelectOption>
                    ))}
                </NativeSelect>
              </label>
            )}
            {batchEnabled && rack && (batchLimit > 1 || quantity > 1) && (
              <label>
                Units in this batch
                <NativeSelect
                  aria-label={`Batch size for ${t.name}`}
                  value={quantity}
                  onChange={(e) =>
                    props.onDraft?.(run.id, {
                      ...draft,
                      quantity: Number(e.target.value),
                    })
                  }
                >
                  {!batchFits && (
                    <NativeSelectOption value={quantity} disabled>
                      {quantity} · too large for this machine
                    </NativeSelectOption>
                  )}
                  {Array.from({ length: batchLimit }, (_, i) => i + 1).map(
                    (n) => (
                      <NativeSelectOption key={n} value={n}>
                        {n} unit{n === 1 ? '' : 's'}
                      </NativeSelectOption>
                    ),
                  )}
                </NativeSelect>
              </label>
            )}
          </div>
          {t.family === 'workload' && racks.length > 1 && (
            <details className="equipment-options">
              <summary>Compare machines for this batch</summary>
              <p className="job-note">
                Bigger machines fit more units. The same batch takes the same
                time; compare the passive production you pause.
              </p>
              <div className="equipment-option-grid">
                {racks.map((id) => {
                  const comparison = jobSetup(
                    f,
                    t,
                    style,
                    id,
                    now,
                    quantity,
                    run.quoteVersion ?? 1,
                  );
                  const fits =
                    !batchEnabled || quantity <= workloadCapacity(f, id);
                  return (
                    <button
                      key={id}
                      disabled={!fits}
                      aria-pressed={rack === id}
                      onClick={() => setRack(id)}
                    >
                      <strong>
                        {OBJECTS.find((o) => o.id === id)?.name ?? id}{' '}
                        {rack === id ? '✓' : ''}
                      </strong>
                      <span>
                        Capacity {workloadCapacity(f, id)} units · normally{' '}
                        {machinePerTick(f, id) * 4} Compute/min
                      </span>
                      <span>
                        {fits
                          ? `${comparison.duration}s · ${comparison.reward} Compute payment`
                          : 'This batch is too large'}
                      </span>
                      <small>
                        Pauses about {comparison.lostIdle} passive Compute
                      </small>
                    </button>
                  );
                })}
              </div>
            </details>
          )}
          <details className="equipment-options">
            <summary>Compare equipment for this setup</summary>
            <div className="equipment-option-grid">
              {(['standard', ...c.loadout] as ModuleStyle[]).map((option) => {
                const comparison = jobSetup(
                  f,
                  t,
                  option,
                  rack,
                  now,
                  quantity,
                  run.quoteVersion ?? 1,
                );
                return (
                  <button
                    key={option}
                    aria-pressed={style === option}
                    onClick={() => setStyle(option)}
                  >
                    <strong>
                      {styleName(option)} {style === option ? '✓' : ''}
                    </strong>
                    <span>
                      {comparison.duration}s · {comparison.reward} Compute
                    </span>
                    <span>
                      {Object.entries(comparison.cost)
                        .map(([id, n]) => `${n} ${ITEMS[id as ItemId].name}`)
                        .join(' · ') || 'No parts'}
                    </span>
                    <small>
                      +{comparison.reputation} reputation · 1 report
                    </small>
                  </button>
                );
              })}
            </div>
          </details>
          <div className="setup-comparison">
            <strong>Client preference: {styleName(t.favored)}</strong>
            <span>Compared with Standard</span>
            {style === 'standard' ? (
              <p>Standard uses the base time and parts shown here.</p>
            ) : !quote.changesTerms ? (
              <p>
                {styleName(style)} does not change this job’s time, parts or
                reputation. Its report still records your chosen equipment.
              </p>
            ) : (
              <ul>
                {quote.secondsSaved !== 0 && (
                  <li>
                    {Math.abs(quote.secondsSaved)}s{' '}
                    {quote.secondsSaved > 0 ? 'sooner' : 'longer'}
                  </li>
                )}
                {quote.materials.map(({ item, change }) => (
                  <li key={item}>
                    {Math.abs(change)} {change < 0 ? 'fewer' : 'extra'}{' '}
                    {ITEMS[item].name.toLowerCase()}
                  </li>
                ))}
                {quote.reputationBonus > 0 && (
                  <li>
                    +{quote.reputationBonus} reputation for the client’s
                    preferred setup
                  </li>
                )}
              </ul>
            )}
          </div>
          <div className="job-payout">
            <span>
              <ComputeIcon size={20} /> {quote.fee} Compute payment
            </span>
            <span>+{quote.reputation} reputation</span>
            <span>+1 job report</span>
            <span>
              <Clock3 size={15} />
              {quote.duration}s
            </span>
          </div>
          {t.family === 'workload' && (
            <p className="job-note">
              {run.quoteVersion === 2
                ? rack
                  ? `${quantity} unit${quantity === 1 ? '' : 's'} together · one report. This machine pauses about ${quote.lostIdle} Compute of idle income while working.`
                  : 'Choose a machine. Larger machines can process more units together; more units use more parts and earn a larger payment. Every batch earns one report.'
                : rack
                  ? `Your existing one-unit job keeps its original terms: ${quote.reservedOutput} Compute replaces paused output. Total payment: ${quote.reward} Compute.`
                  : 'This existing job keeps its original one-unit terms. Choose a machine to see its payment.'}{' '}
              Your other machines keep producing.
            </p>
          )}
          <div className="job-actions">
            {!styleAvailable ? (
              <Button className="primary-action" onClick={props.onEquipment}>
                Equip {styleName(style)} or choose Standard
              </Button>
            ) : !batchFits ? (
              <p className="job-note">
                Choose fewer units or a machine with more capacity.
              </p>
            ) : t.family === 'workload' && !rack && !racks.length ? (
              <div className="job-recovery">
                <strong>No free machine yet</strong>
                <p>
                  Review your center to collect finished client results, wait
                  for an assigned machine, or build another. This job stays
                  accepted.
                </p>
                <Button className="primary-action" onClick={props.onBuild}>
                  Review machines <ArrowRight size={16} />
                </Button>
                {!canPay(f.inventory, quote.cost) && (
                  <button className="text-action" onClick={prepareParts}>
                    Gather parts while you wait
                  </button>
                )}
              </div>
            ) : t.family === 'workload' && !rack ? (
              <p className="job-note">
                Choose a machine above to see its capacity and prepare your
                batch.
              </p>
            ) : !canPay(f.inventory, quote.cost) ? (
              <Button className="primary-action" onClick={prepareParts}>
                Find missing parts <Navigation size={16} />
              </Button>
            ) : !atWorksite ? (
              <Button
                className="primary-action"
                onClick={() => onGuide(run.rack ?? t.target, run.id)}
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
                    quantity,
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
                onClick={() => onGuide(run.rack ?? t.target, run.id)}
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
          {t.family === 'workload' && (
            <p className="job-note">
              {run.quantity ?? 1} unit{(run.quantity ?? 1) === 1 ? '' : 's'} ·{' '}
              {run.reward} Compute on completion · one report
            </p>
          )}
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
            <span>+1 job report</span>
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
              onClick={() => onGuide(run.rack ?? t.target, run.id)}
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
  onParts,
  onBuild,
}: Pick<Props, 'facility' | 'busy' | 'onAction' | 'onParts' | 'onBuild'>) {
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
              {!owned && learned && !canPay(f.inventory, m.cost) && (
                <Button
                  className="outline-button"
                  disabled={busy}
                  onClick={() =>
                    onParts(m.cost, {
                      label: m.name,
                      panel: 'contracts',
                      view: { jobsTab: 'equipment', moduleId: m.id },
                    })
                  }
                >
                  Find module parts <Navigation size={16} />
                </Button>
              )}
              {!owned && learned && f.compute < m.price && (
                <button
                  className="text-action"
                  disabled={busy}
                  onClick={onBuild}
                >
                  Need {m.price - f.compute} more Compute · open your center
                </button>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}

export default function JobsPanel(props: Props) {
  const [tab, setTab] = useState(props.initialTab ?? 'board');
  const { facility: f, now, busy, onAction, onBuild, onLocker, onGold } = props,
    c = careerFor(f),
    licensed = operatorLicense(c);
  const nextGoals = careerSuggestions(f, f.compute, !props.practice).filter(
    (goal) =>
      goal.panel === 'project' ||
      goal.view?.jobsTab === 'equipment' ||
      goal.view?.style,
  );
  return (
    <div className="jobs-board">
      {props.focusFamily && tab === 'board' && (
        <div className="job-focus">
          <strong>
            {props.focusReason === 'goal' ? 'Showing:' : 'Your cluster needs'}{' '}
            {props.focusStyle
              ? `${styleName(props.focusStyle)} ${familyCopy[props.focusFamily].title.toLowerCase()}`
              : familyCopy[props.focusFamily].title.toLowerCase()}
            .
          </strong>
          {(props.focusStyle || props.focusReason !== 'goal') && (
            <p>
              {props.focusStyle
                ? `Equip ${styleName(props.focusStyle)} in Equipment, select it on the job, then start. ${props.focusReason === 'goal' ? 'Compare the setup, finish the job and claim your stamp.' : 'Claim the report and bring it with the required parts to Margo.'}`
                : props.focusReason === 'goal'
                  ? 'Choose a job below. Finish it and collect its payment and report.'
                  : 'Complete one and collect its report. Bring that report and the project’s required parts to Margo.'}
            </p>
          )}
          {props.focusStyle && (
            <button className="text-action" onClick={() => setTab('equipment')}>
              Open Equipment
            </button>
          )}
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
          <strong>{licensed ? 'Licensed operator' : 'Your career'}</strong>
          <span>
            Level {careerLevel(c)} · {c.reputation} reputation ·{' '}
            {completedContracts(c)} jobs completed
          </span>
          {(c.commissioned ?? 0) > 0 && (
            <span>{c.commissioned} clusters commissioned</span>
          )}
        </div>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="jobs-tabs">
          <TabsTrigger value="board">Job board</TabsTrigger>
          <TabsTrigger value="equipment">Equipment</TabsTrigger>
          <TabsTrigger value="progress">My goals</TabsTrigger>
        </TabsList>
        <TabsContent value="board">
          {props.personalGoals && (
            <div className="job-goal-entry">
              <button
                className="text-action"
                onClick={() => setTab('progress')}
              >
                {props.personalGoals.goal
                  ? 'Review your shift goal'
                  : 'Choose a goal for this shift'}{' '}
                <ArrowRight size={16} />
              </button>
              <small>Optional focus · repeat whenever you like</small>
            </div>
          )}
          {!props.focusFamily && !c.active.length && nextGoals.length > 0 && (
            <div className="next-goal-choices">
              <h3>What will you work toward?</h3>
              <div>
                {nextGoals.map((choice) => (
                  <button
                    key={choice.title}
                    onClick={() =>
                      choice.panel === 'project'
                        ? props.onProject?.()
                        : props.onPlan(choice)
                    }
                  >
                    <strong>{choice.title}</strong>
                    <span>{choice.detail}</span>
                    <small>
                      {choice.reward} <ArrowRight size={14} />
                    </small>
                  </button>
                ))}
              </div>
            </div>
          )}
          {props.focusFamily &&
            c.active.length >= 2 &&
            !c.active.some(
              (run) => contractFor(run).family === props.focusFamily,
            ) && (
              <p className="job-note">
                Both job slots are in use. Your current work is shown below;
                finish one or cancel an unstarted job to make room.
              </p>
            )}
          {c.active.length > 0 && (
            <div
              className="job-section-heading"
              id="current-client-work"
              tabIndex={-1}
            >
              <h3>Your work</h3>
              <span>{c.active.length}/2 different jobs accepted</span>
            </div>
          )}
          {c.active.length ? (
            <div className="active-jobs">
              {[...c.active]
                .sort(
                  (a, b) =>
                    Number(b.id === props.focusJobId) -
                    Number(a.id === props.focusJobId),
                )
                .map((run) => (
                  <ActiveJob
                    key={run.id}
                    {...props}
                    onEquipment={() => setTab('equipment')}
                    run={run}
                  />
                ))}
            </div>
          ) : null}
          <div className="job-section-heading">
            <h3>Pick your next job</h3>
            <span>Fresh offers after each completed job</span>
          </div>
          {(['service', 'supply', 'workload'] as const).some(
            (family) => dispatchCount(c, family) > 0,
          ) && (
            <p className="job-note">
              Saved job choices:{' '}
              {(['service', 'supply', 'workload'] as const)
                .filter((family) => dispatchCount(c, family) > 0)
                .map((family) => `${dispatchCount(c, family)} ${family}`)
                .join(' · ')}
              . Use an offer’s menu to pick a different unlocked job. Your
              choice is used only when you accept.
            </p>
          )}
          <div className="job-offers">
            {c.offers
              .filter(
                (o) =>
                  !c.active.some((run) => run.id === o.id) &&
                  (!props.focusFamily ||
                    contractFor(o).family === props.focusFamily),
              )
              .map((o) => (
                <JobOffer
                  key={`${o.id}:${o.template}:${o.termsVersion ?? 1}:${(c.dispatchChoices?.[contractFor(o).family] ?? []).join(',')}`}
                  offer={o}
                  facility={f}
                  busy={busy}
                  onAction={onAction}
                  onBuild={onBuild}
                  onReview={() =>
                    document.getElementById('current-client-work')?.focus()
                  }
                />
              ))}
          </div>
          <details className="equipment-options">
            <summary>What do job rewards do?</summary>
            <p className="job-note">
              Compute buys upgrades and supplies. Reputation unlocks jobs and
              equipment. Reports are proof of finished jobs; use them with parts
              to build crew clusters.
            </p>
          </details>
          <details className="license-progress">
            <summary>
              {licensed
                ? 'Operator license earned'
                : 'Your next career milestone'}
            </summary>
            <strong>
              {licensed
                ? 'Operator license earned'
                : 'Earn your Operator license'}
            </strong>
            <p>
              Complete two jobs of each kind, build a module and commission a
              neighborhood cluster. Your equipment and savings stay yours as you
              progress.{' '}
              {props.practice &&
                'Neighborhood clusters require a connected wallet account. No tokens are needed; guest practice saves stay separate.'}
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
          </details>
        </TabsContent>
        <TabsContent value="equipment">
          <ModuleWorkshop
            facility={f}
            busy={busy}
            onAction={onAction}
            onParts={props.onParts}
            onBuild={onBuild}
          />
        </TabsContent>
        <TabsContent value="progress">
          {props.personalGoals && (
            <PersonalGoals
              controller={props.personalGoals}
              facility={f}
              onPlan={props.onPlan}
            />
          )}
          <div className="mastery-collection">
            <h3>Master your equipment</h3>
            <p>
              {CONTRACT_TEMPLATES.reduce(
                (n, t) =>
                  n +
                  usefulStyles(f, t).filter(
                    (style) => (c.mastery?.[t.id]?.[style] ?? 0) > 0,
                  ).length,
                0,
              )}
              /
              {CONTRACT_TEMPLATES.reduce(
                (n, t) => n + usefulStyles(f, t).length,
                0,
              )}{' '}
              distinct setups completed. These combinations change the time,
              materials or reputation for a job.
            </p>
            <div className="mastery-grid">
              {CONTRACT_TEMPLATES.map((t) => (
                <div key={t.id}>
                  <strong>{t.name}</strong>
                  <span>
                    {usefulStyles(f, t).map((style) => (
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
            <details className="optional-stamps">
              <summary>All stamps retained · {masteryStamps(c)}/36</summary>
              <p>
                Other equipment combinations can also earn collection stamps,
                even when their job terms match Standard. Every stamp you
                already earned still counts toward your room colors and trophy.
              </p>
            </details>
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
