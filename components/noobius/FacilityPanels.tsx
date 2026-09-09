'use client';
import { canTrade, TRADE_QUALIFICATION, type MarketPage } from '@/lib/market';
import { QUICK_PINGS, REPORT_REASONS, type SocialSnapshot } from '@/lib/social';
import type { ContractFamily, ModuleStyle } from '@/lib/contracts';
import type { JobDraft } from './JobsPanel';
import TycoonBuildPanel from './TycoonBuildPanel';
import GoalsPanel from './GoalsPanel';
import JobsPanel from './JobsPanel';
import RoomProgressPanel from './RoomProgressPanel';
import ItemIcon from './ItemIcon';
import { useEffect, useState, useRef } from 'react';
import {
  ArrowRight,
  Check,
  Lock,
  Package,
  Send,
  Wrench,
  Zap,
  Users,
  ArrowDownToLine,
  ArrowUpFromLine,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  ITEMS,
  SHOP_ITEMS,
  ZONES,
  OBJECTS,
  RECIPES,
  STORY,
  ORDERS,
  OUTFITS,
  buildCost,
  canPay,
  craftQuote,
  recipeFor,
  capacity,
  computePerTick,
  modules,
  powerBudget,
  coolingBudget,
  skillLevel,
  storyValue,
  itemCount,
  energyNow,
  dayKey,
  DAILY_TASKS,
  type FacilityAction,
  type WorldObject,
  type ItemId,
  type Bag,
  type CraftVariant,
} from '@/lib/facility';
import type { Profile } from '@/lib/game';
import { api } from './useNoobius';
import type {
  Objective,
  GuideView,
  NextStep,
  PartsRequest,
} from '@/lib/objectives';
export type ExpansionPanel =
  | 'map'
  | 'inventory'
  | 'crafting'
  | 'contracts'
  | 'facility'
  | 'market'
  | 'skills'
  | 'social'
  | 'rewards';
export const PANEL_COPY: Record<ExpansionPanel, [string, string]> = {
  map: ['Expand', 'Choose a room.'],
  inventory: ['Your parts', 'Carry or store parts.'],
  crafting: ['Workbench', 'Make what you need.'],
  contracts: ['Jobs', 'Choose what your next shift looks like.'],
  facility: ['Your center', 'Build, configure and put your machines to work.'],
  market: ['Shop', 'Buy parts or trade with players.'],
  skills: ['Your progress', 'Earn new skills.'],
  social: ['Crew chat', 'Say hello.'],
  rewards: ['Compute', 'Your game balance.'],
};
type Props = {
  view?: GuideView;
  panel: ExpansionPanel;
  profile: Profile;
  selected: WorldObject | null;
  position: { x: number; z: number };
  busy: boolean;
  onAction: (a: Omit<FacilityAction, 'requestId'>) => Promise<unknown>;
  onMarket: (a: string, b: Record<string, unknown>) => Promise<unknown>;
  onPanel: (p: ExpansionPanel, selected?: WorldObject) => void;
  onTravel: () => void;
  onExtra: () => void;
  onLocker: (previewGold?: boolean) => void;
  objective: Objective;
  onFollow: () => void;
  onRepair: () => void;
  onHelp: (request: PartsRequest) => void;
  onGuide: (object: WorldObject, view?: GuideView) => void;
  jobTab?: string;
  focusFamily?: ContractFamily;
  focusStyle?: ModuleStyle;
  focusReason?: 'project' | 'goal';
  onPlan: (step: NextStep) => void;
  onClearFocus?: () => void;
  onProject?: () => void;
  onConnect?: () => void;
  drafts?: Record<string, JobDraft>;
  onDraft?: (id: string, draft: JobDraft) => void;
  craftDraft?: { recipe?: ItemId; quantity: number; variant?: CraftVariant };
  craftPurpose?: string;
  onCraftDraft?: (draft: {
    recipe?: ItemId;
    quantity: number;
    variant?: CraftVariant;
  }) => void;
};
function Parts({ cost, bag }: { cost: Bag; bag?: Bag }) {
  return (
    <span className="parts-cost">
      {Object.entries(cost).map(([key, n]) => (
        <span
          key={key}
          className={bag && (bag[key as ItemId] ?? 0) < n! ? 'shortage' : ''}
        >
          <ItemIcon item={key as ItemId} size={16} />
          {n} {ITEMS[key as ItemId].name}
        </span>
      ))}
    </span>
  );
}
export default function FacilityPanels({
  view,
  panel,
  profile,
  selected,
  position,
  busy,
  onAction,
  onMarket,
  onPanel,
  onTravel,
  onExtra,
  onLocker,
  objective,
  onFollow,
  onRepair,
  onHelp,
  onGuide,
  jobTab = 'story',
  focusFamily,
  focusStyle,
  focusReason,
  onPlan,
  onClearFocus,
  onProject,
  onConnect,
  drafts,
  onDraft,
  craftDraft,
  craftPurpose,
  onCraftDraft,
}: Props) {
  const workbench = OBJECTS.find((object) => object.id === 'workbench')!;
  const atWorkbench =
    Math.hypot(position.x - workbench.x, position.z - workbench.z) <= 3.5;
  const f = profile.facility!,
    [now, setNow] = useState(Date.now),
    [quantity, setQuantity] = useState(1),
    [item, setItem] = useState<ItemId>('scrap'),
    [price, setPrice] = useState(10),
    [listings, setListings] = useState<MarketPage['listings']>([]),
    [marketSearch, setMarketSearch] = useState(''),
    [marketScope, setMarketScope] = useState('all'),
    [nextCursor, setNextCursor] = useState<string | null>(null),
    [recipients, setRecipients] = useState<MarketPage['recipients']>([]),
    [recipient, setRecipient] = useState(''),
    [messages, setMessages] = useState<any[]>([]),
    [chat, setChat] = useState(''),
    [online, setOnline] = useState(0),
    [remoteError, setRemoteError] = useState(''),
    [remoteBusy, setRemoteBusy] = useState(false),
    [tab, setTab] = useState('merchant'),
    [allContracts, setAllContracts] = useState(false),
    [social, setSocial] = useState<SocialSnapshot>({
      preferences: [],
      recent: [],
    }),
    [reporting, setReporting] = useState<string | null>(null),
    [reportReason, setReportReason] = useState('Spam');
  const craftQuantity = f.craft?.quantity ?? craftDraft?.quantity ?? 1;
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const remoteVersion = useRef(0);
  const tradeReady = profile.wallet !== 'practice' && canTrade(f);
  const load = async (append = false) => {
    const version = ++remoteVersion.current;
    try {
      if (panel === 'market') {
        const params = new URLSearchParams({
          q: marketSearch,
          scope: marketScope,
        });
        if (append && nextCursor) params.set('cursor', nextCursor);
        const d = await api<MarketPage>('listings?' + params);
        if (version !== remoteVersion.current) return;
        setListings((previous) =>
          append
            ? [
                ...previous,
                ...d.listings.filter(
                  (next) => !previous.some((old) => old.id === next.id),
                ),
              ]
            : d.listings,
        );
        setNextCursor(d.nextCursor);
        setRecipients(d.recipients);
      }
      if (panel === 'social' && profile.wallet !== 'practice') {
        const [d, p, settings] = await Promise.all([
          api<{ messages: any[] }>('messages'),
          api<{ facilities: any[] }>('directory'),
          api<SocialSnapshot>('social'),
        ]);
        if (version !== remoteVersion.current) return;
        setMessages(d.messages);
        setOnline(p.facilities.length);
        setSocial(settings);
      }
      setRemoteError('');
    } catch (e) {
      if (version !== remoteVersion.current) return;
      setRemoteError(
        e instanceof Error ? e.message : 'Connection interrupted.',
      );
    }
  };
  useEffect(() => {
    if (!['market', 'social'].includes(panel)) return;
    const start = setTimeout(() => void load(), panel === 'market' ? 200 : 0);
    const timer =
      panel === 'social' && profile.wallet !== 'practice'
        ? setInterval(() => void load(), 10000)
        : null;
    return () => {
      clearTimeout(start);
      if (timer) clearInterval(timer);
      remoteVersion.current++;
    };
  }, [panel, marketSearch, marketScope]);
  const action = async (a: Omit<FacilityAction, 'requestId'>) => {
    await onAction(a);
  };
  const market = async (a: string, b: Record<string, unknown>) => {
    setRemoteBusy(true);
    try {
      const result = await onMarket(a, b);
      if (!result) return false;
      await load();
      return true;
    } finally {
      setRemoteBusy(false);
    }
  };
  const ids = Object.keys(ITEMS) as ItemId[];
  if (panel === 'map')
    return (
      <RoomProgressPanel
        facility={f}
        balance={profile.credits}
        busy={busy}
        now={now}
        initialRoom={selected?.kind === 'gate' ? selected.zone : undefined}
        onAction={onAction}
        onTravel={onTravel}
        onBuild={(plot) => onPanel('facility', plot)}
      />
    );
  if (panel === 'inventory')
    return (
      <div>
        <div className="facility-summary">
          <span>
            <strong>
              {itemCount(f.inventory)}/{120 + f.storage * 40}
            </strong>{' '}
            backpack
          </span>
          <span>
            <strong>{itemCount(f.bank)}</strong> stored parts
          </span>
          <span>
            <strong>{energyNow(f, now)}</strong> suit energy
          </span>
        </div>
        {view?.item && (
          <p className="inventory-focus-note">
            {view.inventoryTab === 'bank' ? 'Take' : 'Store'}{' '}
            {ITEMS[view.item].name.toLowerCase()} using the highlighted row. You
            choose the quantity.
          </p>
        )}
        <Tabs defaultValue={view?.inventoryTab ?? 'bag'}>
          <TabsList className="expansion-tabs">
            <TabsTrigger value="bag">Backpack</TabsTrigger>
            <TabsTrigger value="bank">Storage</TabsTrigger>
          </TabsList>
          {(['bag', 'bank'] as const).map((where) => (
            <TabsContent value={where} key={where}>
              <div className="inventory-grid">
                {ids
                  .filter(
                    (id) =>
                      ((where === 'bag' ? f.inventory : f.bank)[id] ?? 0) > 0,
                  )
                  .map((id) => (
                    <div
                      className={`inventory-item ${view?.item === id ? 'is-guided-item' : ''}`}
                      key={id}
                    >
                      <span
                        className="item-icon"
                        style={{
                          color: ITEMS[id].color,
                          borderColor: ITEMS[id].color + '55',
                        }}
                      >
                        <ItemIcon item={id} />
                      </span>
                      <strong>{ITEMS[id].name}</strong>
                      <b>{(where === 'bag' ? f.inventory : f.bank)[id]}</b>
                      <div>
                        <button
                          disabled={busy}
                          onClick={() =>
                            action({
                              type: 'bank',
                              item: id,
                              quantity: 1,
                              direction:
                                where === 'bag' ? 'deposit' : 'withdraw',
                            })
                          }
                        >
                          {where === 'bag' ? (
                            <ArrowDownToLine size={14} />
                          ) : (
                            <ArrowUpFromLine size={14} />
                          )}{' '}
                          1
                        </button>
                        <button
                          disabled={busy}
                          onClick={() =>
                            action({
                              type: 'bank',
                              item: id,
                              quantity: Math.min(
                                500,
                                (where === 'bag' ? f.inventory : f.bank)[id] ??
                                  0,
                              ),
                              direction:
                                where === 'bag' ? 'deposit' : 'withdraw',
                            })
                          }
                        >
                          {where === 'bag' ? 'Store all' : 'Take all'}
                        </button>
                        {id === 'coffee' && where === 'bag' && (
                          <button
                            disabled={busy || energyNow(f, now) >= 100}
                            onClick={() => action({ type: 'coffee' })}
                          >
                            Use
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
              {itemCount(where === 'bag' ? f.inventory : f.bank) === 0 && (
                <p className="empty-state">
                  No parts yet. Follow your next step to find some.
                </p>
              )}
            </TabsContent>
          ))}
        </Tabs>
        <button
          className="outline-button"
          disabled={
            busy ||
            f.storage >= 5 ||
            profile.credits < 80 + f.storage * 60 ||
            !f.inventory.kit
          }
          onClick={() => action({ type: 'storage' })}
        >
          Expand backpack +40 · 1 kit + {80 + f.storage * 60} Compute
        </button>
      </div>
    );
  if (panel === 'crafting')
    return (
      <div className="crafting-panel">
        {!atWorkbench && (
          <Button
            className="primary-action"
            onClick={() =>
              onGuide(workbench, {
                recipe: craftDraft?.recipe,
                quantity: craftQuantity,
                recipeVariant: craftDraft?.variant,
              })
            }
          >
            Go to workbench <ArrowRight size={18} />
          </Button>
        )}
        {!(f.stats.crafted ?? 0) && (
          <p className="muted-small">Start with a repair kit.</p>
        )}
        <div className="facility-summary">
          <span>
            <strong>{skillLevel(f.skills.engineering)}</strong> engineering
            level
          </span>
          <span>
            <strong>{f.stats.crafted ?? 0}</strong> parts made
          </span>
        </div>
        {!f.craft && (
          <label className="dispatch-picker">
            How many parts?
            <NativeSelect
              aria-label="Craft batch size"
              value={craftQuantity}
              onChange={(e) =>
                onCraftDraft?.({
                  ...craftDraft,
                  quantity: Number(e.target.value),
                })
              }
            >
              {Array.from({ length: 30 }, (_, i) => i + 1).map((n) => (
                <NativeSelectOption key={n} value={n}>
                  {n} part{n === 1 ? '' : 's'}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
        )}
        {f.craft && (
          <div className="fabrication-active">
            <Wrench size={24} />
            <span>
              <strong>
                {f.craft.quantity ?? 1} × {ITEMS[f.craft.recipe as ItemId].name}
                {f.craft.recipe === 'board' &&
                  ` · ${f.craft.variant === 'recovered' ? 'Recovered' : 'Standard'} parts`}
              </strong>
              <small>
                {now < f.craft.readyAt
                  ? `${Math.ceil((f.craft.readyAt - now) / 1000)} seconds remaining`
                  : 'Ready at the bench'}
              </small>
            </span>
            <Button
              className="outline-button"
              disabled={
                busy ||
                now < f.craft.readyAt ||
                !atWorkbench ||
                itemCount(f.inventory) + (f.craft.quantity ?? 1) >
                  120 + f.storage * 40
              }
              onClick={() => action({ type: 'collect', id: f.craft?.id })}
            >
              Collect
            </Button>
            {itemCount(f.inventory) + (f.craft.quantity ?? 1) >
              120 + f.storage * 40 && (
              <div className="muted-small">
                <p>
                  Free{' '}
                  {itemCount(f.inventory) +
                    (f.craft.quantity ?? 1) -
                    (120 + f.storage * 40)}{' '}
                  backpack spaces to collect. Your finished parts stay here.
                </p>
                <Button
                  className="outline-button"
                  onClick={() => onPanel('inventory')}
                >
                  Manage parts
                </Button>
              </div>
            )}
          </div>
        )}
        <div className="recipe-list">
          {[...RECIPES]
            .sort(
              (a, b) =>
                Number(b.id === craftDraft?.recipe) -
                Number(a.id === craftDraft?.recipe),
            )
            .map((base) => {
              const variant =
                base.id === 'board'
                  ? f.craft?.recipe === 'board'
                    ? (f.craft.variant ?? 'standard')
                    : (craftDraft?.variant ?? 'standard')
                  : undefined;
              const r = recipeFor(base.id, variant);
              const quote = craftQuote(r, craftQuantity);
              const open =
                f.unlocked.includes(r.zone) &&
                skillLevel(f.skills.engineering) >= r.skill;
              return (
                <div
                  className={`recipe ${r.id === craftDraft?.recipe ? 'is-focused' : ''}`}
                  key={r.id}
                >
                  {r.id === craftDraft?.recipe && (
                    <p className="muted-small">
                      {craftPurpose
                        ? `For ${craftPurpose}`
                        : 'Your selected recipe'}{' '}
                      · {craftQuantity} part{craftQuantity === 1 ? '' : 's'}
                      {variant === 'recovered' && ' · Recovered parts'}
                    </p>
                  )}
                  <div className="recipe-title">
                    <span
                      className="item-icon"
                      style={{ color: ITEMS[r.id].color }}
                    >
                      {ITEMS[r.id].short}
                    </span>
                    <div>
                      <h3>{r.name}</h3>
                      <p>{r.description}</p>
                    </div>
                  </div>
                  {r.id === 'board' && !f.craft && (
                    <label className="dispatch-picker">
                      Parts route
                      <NativeSelect
                        aria-label="Board parts route"
                        value={variant}
                        disabled={busy}
                        onChange={(e) =>
                          onCraftDraft?.({
                            recipe: 'board',
                            quantity: craftQuantity,
                            variant: e.target.value as CraftVariant,
                          })
                        }
                      >
                        <NativeSelectOption value="standard">
                          Standard parts
                        </NativeSelectOption>
                        <NativeSelectOption value="recovered">
                          Recovered parts
                        </NativeSelectOption>
                      </NativeSelect>
                      <small>Same board. Different ingredients.</small>
                    </label>
                  )}
                  <Parts cost={quote.cost} bag={f.inventory} />
                  {open && !canPay(f.inventory, quote.cost) && !f.craft && (
                    <button
                      className="find-parts-button"
                      onClick={() => {
                        onCraftDraft?.({
                          recipe: r.id,
                          quantity: craftQuantity,
                          variant,
                        });
                        onHelp({
                          items: quote.cost,
                          ...(r.id === 'board'
                            ? { boardVariant: variant }
                            : {}),
                          source: {
                            label: `${craftQuantity} × ${r.name}`,
                            panel: 'crafting',
                            view: {
                              recipe: r.id,
                              quantity: craftQuantity,
                              recipeVariant: variant,
                            },
                          },
                        });
                      }}
                    >
                      Find the missing parts <ArrowRight size={14} />
                    </button>
                  )}
                  <div className="recipe-bottom">
                    <small>
                      {quote.seconds}s · Engineering {r.skill}
                      {skillLevel(f.skills.engineering) < r.skill
                        ? ' required'
                        : ''}
                      {!f.unlocked.includes(r.zone)
                        ? ` · Open ${ZONES.find((z) => z.id === r.zone)?.name}`
                        : ''}
                    </small>
                    <Button
                      disabled={
                        busy ||
                        !!f.craft ||
                        !open ||
                        !atWorkbench ||
                        !canPay(f.inventory, quote.cost)
                      }
                      className="outline-button"
                      onClick={() =>
                        action({
                          type: 'craft',
                          id: r.id,
                          quantity: craftQuantity,
                          variant,
                        })
                      }
                    >
                      {!open ? <Lock size={14} /> : <Wrench size={14} />} Make{' '}
                      {craftQuantity} × {r.name.toLowerCase()} · {quote.seconds}
                      s
                    </Button>
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    );
  if (panel === 'contracts')
    return (
      <JobsPanel
        initialTab={view?.jobsTab}
        focusJobId={view?.jobId}
        practice={profile.wallet === 'practice'}
        focusReason={focusReason}
        onPlan={onPlan}
        focusFamily={focusFamily}
        focusStyle={focusStyle}
        onClearFocus={onClearFocus}
        onProject={onProject}
        drafts={drafts}
        onDraft={onDraft}
        position={position}
        facility={f}
        now={now}
        busy={busy}
        onAction={onAction}
        onBuild={() => onPanel('facility')}
        onGold={() => onLocker(true)}
        onLocker={() => onLocker()}
        onParts={(items, source) =>
          onHelp({
            items,
            source: source ?? {
              label: 'equipment',
              panel: 'contracts',
              view: { jobsTab: 'equipment' },
            },
          })
        }
        onGuide={(id, jobId) => {
          const object = OBJECTS.find((o) => o.id === id);
          if (object)
            onGuide(
              { ...object, panel: 'contracts' },
              { jobsTab: 'board', jobId },
            );
        }}
      />
    );
  if (panel === 'facility')
    return (
      <TycoonBuildPanel
        facility={f}
        balance={profile.credits}
        busy={busy}
        now={now}
        selected={selected?.id}
        onAction={onAction}
        onExpand={() => onPanel('map')}
        onExtra={onExtra}
      />
    );
  if (panel === 'market')
    return (
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="expansion-tabs">
          <TabsTrigger value="merchant">Buy parts</TabsTrigger>
          <TabsTrigger value="players">Player market</TabsTrigger>
          <TabsTrigger value="sell">Sell</TabsTrigger>
        </TabsList>
        <TabsContent value="merchant">
          <label className="trade-quantity">
            Quantity{' '}
            <input
              type="number"
              min={1}
              max={50}
              value={quantity}
              onChange={(e) =>
                setQuantity(
                  Math.max(1, Math.min(50, Number(e.target.value) || 1)),
                )
              }
            />
          </label>
          <div className="merchant-list">
            {ids.map((id) => (
              <div className="merchant-item" key={id}>
                <span className="item-icon" style={{ color: ITEMS[id].color }}>
                  <ItemIcon item={id} />
                </span>
                <span>
                  <strong>{ITEMS[id].name}</strong>
                  <small>{f.inventory[id] ?? 0} in backpack</small>
                </span>
                <button
                  disabled={
                    busy ||
                    (SHOP_ITEMS.includes(id) &&
                      profile.credits < ITEMS[id].buy * quantity)
                  }
                  onClick={() =>
                    SHOP_ITEMS.includes(id)
                      ? action({ type: 'buy', item: id, quantity })
                      : onHelp({ items: { [id]: quantity } })
                  }
                >
                  {SHOP_ITEMS.includes(id)
                    ? `Buy ${ITEMS[id].buy * quantity}`
                    : 'Craft or trade'}
                </button>
                <button
                  disabled={busy || (f.inventory[id] ?? 0) < quantity}
                  onClick={() => action({ type: 'sell', item: id, quantity })}
                >
                  Sell {ITEMS[id].sell * quantity}
                </button>
              </div>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="players">
          <p className="muted-small">
            Player-to-player trades use game Compute. Listings hold the seller’s
            items until sold or cancelled. No tokens or money change hands.
          </p>
          {profile.wallet === 'practice' && (
            <p className="token-note">
              Connect a wallet to list or buy from another technician.
            </p>
          )}
          {!tradeReady && profile.wallet !== 'practice' && (
            <p className="token-note">{TRADE_QUALIFICATION}</p>
          )}
          <div className="market-filters">
            <label>
              Search items or players
              <input
                value={marketSearch}
                onChange={(e) => setMarketSearch(e.target.value)}
                placeholder="Copper, boards, a neighbor…"
              />
            </label>
            <label>
              Show
              <select
                value={marketScope}
                onChange={(e) => setMarketScope(e.target.value)}
              >
                <option value="all">All offers</option>
                <option value="mine">My listings</option>
                <option value="direct">Offers for me</option>
              </select>
            </label>
            <Button
              variant="outline"
              disabled={remoteBusy}
              onClick={() => void load()}
            >
              Refresh
            </Button>
          </div>
          {listings.length ? (
            listings.map((l) => (
              <div className="player-listing" key={l.id}>
                <div>
                  <strong>
                    {l.quantity} × {ITEMS[l.item as ItemId]?.name ?? l.item}
                  </strong>
                  <small>
                    {l.direct ? 'Direct offer from' : 'Listed by'} {l.name} ·{' '}
                    {l.price} Compute total
                  </small>
                </div>
                <Button
                  className="outline-button"
                  disabled={
                    busy ||
                    remoteBusy ||
                    profile.wallet === 'practice' ||
                    (!l.mine && !tradeReady)
                  }
                  onClick={() =>
                    market(!!l.mine ? 'listing-cancel' : 'listing-buy', {
                      id: l.id,
                    })
                  }
                >
                  {!!l.mine ? 'Cancel' : 'Buy'}
                </Button>
              </div>
            ))
          ) : (
            <div className="empty-state">
              <Package size={30} />
              <p>No player listings yet. The parts merchant is always open.</p>
            </div>
          )}
          {nextCursor && (
            <Button
              variant="outline"
              disabled={remoteBusy}
              onClick={async () => {
                setRemoteBusy(true);
                try {
                  await load(true);
                } finally {
                  setRemoteBusy(false);
                }
              }}
            >
              Load more offers
            </Button>
          )}
          <button
            className="text-action"
            onClick={() => onGuide(OBJECTS.find((o) => o.id === 'bank')!)}
          >
            Open parts storage <ArrowRight size={16} />
          </button>
        </TabsContent>
        <TabsContent value="sell">
          {!tradeReady && (
            <p className="token-note">
              {profile.wallet === 'practice'
                ? 'Connect to trade with players.'
                : TRADE_QUALIFICATION}
            </p>
          )}
          <div className="listing-form">
            <label>
              Offer to
              <select
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
              >
                <option value="">Everyone</option>
                {recipients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} only
                  </option>
                ))}
              </select>
            </label>
            <label>
              Item
              <select
                value={item}
                onChange={(e) => setItem(e.target.value as ItemId)}
              >
                {ids.map((id) => (
                  <option key={id} value={id}>
                    {ITEMS[id].name} ({f.inventory[id] ?? 0} owned)
                  </option>
                ))}
              </select>
            </label>
            <label>
              Quantity
              <input
                type="number"
                min={1}
                max={50}
                value={quantity}
                onChange={(e) =>
                  setQuantity(
                    Math.max(1, Math.min(50, Number(e.target.value) || 1)),
                  )
                }
              />
            </label>
            <label>
              Total asking price in Compute
              <input
                type="number"
                min={1}
                max={10000}
                value={price}
                onChange={(e) =>
                  setPrice(
                    Math.max(1, Math.min(10000, Number(e.target.value) || 1)),
                  )
                }
              />
            </label>
            <Button
              className="primary-action"
              disabled={
                busy ||
                remoteBusy ||
                !tradeReady ||
                (f.inventory[item] ?? 0) < quantity
              }
              onClick={async () => {
                if (
                  await market('listing-create', {
                    item,
                    quantity,
                    price,
                    recipient,
                  })
                )
                  setTab('players');
              }}
            >
              List items <ArrowRight size={16} />
            </Button>
            <p className="muted-small">
              Up to 10 open listings. Cancelled items return to your parts
              storage. Sales transfer existing Compute between players.
            </p>
          </div>
        </TabsContent>
        {remoteError && (
          <p role="alert" className="modal-error">
            {remoteError}
          </p>
        )}
      </Tabs>
    );
  if (panel === 'skills')
    return (
      <div>
        <div className="skill-list">
          {(['salvaging', 'engineering', 'operations'] as const).map((id) => (
            <div className="skill-card" key={id}>
              <div>
                <strong>{id[0].toUpperCase() + id.slice(1)}</strong>
                <span>Level {skillLevel(f.skills[id])}</span>
              </div>
              <Progress
                value={
                  ((f.skills[id] - (skillLevel(f.skills[id]) - 1) ** 2 * 20) /
                    (skillLevel(f.skills[id]) ** 2 * 20 -
                      (skillLevel(f.skills[id]) - 1) ** 2 * 20)) *
                  100
                }
                aria-label={id + ' level progress'}
              />
              <small>
                {f.skills[id]} XP ·{' '}
                {id === 'salvaging'
                  ? 'Gather parts. Higher levels recover a little more.'
                  : id === 'engineering'
                    ? 'Craft and build. Level 2 opens utility recipes.'
                    : 'Repair systems and fulfil customer deliveries.'}
              </small>
            </div>
          ))}
        </div>
        <h3 className="section-label">Crew uniforms</h3>
        <div className="outfit-grid">
          {OUTFITS.map((o) => (
            <button
              className={f.outfit === o.id ? 'selected' : ''}
              disabled={
                busy ||
                (!f.owned.includes(o.id) &&
                  (profile.credits < o.price || o.id === 'afterhours'))
              }
              onClick={() => action({ type: 'outfit', id: o.id })}
              key={o.id}
            >
              <span style={{ background: o.color }} />
              <strong>{o.name}</strong>
              <small>
                {f.outfit === o.id
                  ? 'Wearing'
                  : f.owned.includes(o.id)
                    ? 'Equip'
                    : o.id === 'afterhours'
                      ? `${Math.min(f.workdays, 3)}/3 daily cards`
                      : o.price + ' credits'}
              </small>
            </button>
          ))}
        </div>
        <p className="muted-small">
          Uniforms are cosmetic. Expertise and facility upgrades come from
          playing.
        </p>
      </div>
    );
  if (panel === 'social')
    return (
      <div className="crew-chat">
        <div className="chat-presence">
          <Users size={18} />
          {online} connected technician{online === 1 ? '' : 's'} nearby
        </div>
        {profile.wallet === 'practice' && (
          <p className="muted-small">
            Connect to join a neighborhood and chat with your crew.
          </p>
        )}
        <div className="chat-messages" role="log" aria-label="Crew messages">
          {messages.map((m) => (
            <div className="chat-message" key={m.id}>
              <div>
                <strong>{m.name}</strong>
                <small>
                  {new Date(m.created_at).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </small>
                {!m.mine && (
                  <>
                    <button
                      disabled={remoteBusy}
                      onClick={() =>
                        void market('social-preference', {
                          target: m.author,
                          kind: 'mute',
                          enabled: true,
                        })
                      }
                    >
                      Mute
                    </button>
                    <button
                      disabled={remoteBusy}
                      onClick={() =>
                        void market('social-preference', {
                          target: m.author,
                          kind: 'block',
                          enabled: true,
                        })
                      }
                    >
                      Block
                    </button>
                    <button
                      onClick={() =>
                        setReporting(reporting === m.id ? null : m.id)
                      }
                    >
                      Report
                    </button>
                  </>
                )}
              </div>
              <p>{m.message}</p>
              {reporting === m.id && (
                <div className="chat-report">
                  <label>
                    Reason{' '}
                    <select
                      value={reportReason}
                      onChange={(e) => setReportReason(e.target.value)}
                    >
                      {REPORT_REASONS.map((reason) => (
                        <option key={reason}>{reason}</option>
                      ))}
                    </select>
                  </label>
                  <Button
                    disabled={remoteBusy}
                    onClick={async () => {
                      if (
                        await market('report', {
                          messageId: m.id,
                          reason: reportReason,
                        })
                      )
                        setReporting(null);
                    }}
                  >
                    Send report
                  </Button>
                </div>
              )}
            </div>
          ))}
          {!messages.length && (
            <p className="empty-state">
              Quiet on the night shift. Say hello to the next technician.
            </p>
          )}
        </div>
        {profile.wallet === 'practice' ? (
          <Button className="primary-action" onClick={onConnect}>
            Connect to chat
          </Button>
        ) : (
          <div className="chat-pings">
            {Object.entries(QUICK_PINGS).map(([id, message]) => (
              <Button
                key={id}
                variant="outline"
                disabled={remoteBusy || busy}
                onClick={() => void market('message', { ping: id })}
              >
                {message}
              </Button>
            ))}
          </div>
        )}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!chat.trim() || remoteBusy) return;
            setRemoteBusy(true);
            try {
              if (await market('message', { message: chat.trim() }))
                setChat('');
            } catch (e) {
              setRemoteError(
                e instanceof Error ? e.message : 'Message failed.',
              );
            } finally {
              setRemoteBusy(false);
            }
          }}
        >
          <input
            aria-label="Crew message"
            maxLength={180}
            placeholder="Keep it friendly. Keep the future online."
            value={chat}
            onChange={(e) => setChat(e.target.value)}
            disabled={profile.wallet === 'practice'}
          />
          <button
            aria-label="Send message"
            disabled={
              remoteBusy || profile.wallet === 'practice' || !chat.trim()
            }
          >
            <Send size={18} />
          </button>
        </form>
        <p className="muted-small">
          Mute hides messages. Block also stops visits between your centers.
          These choices are saved to your account.
        </p>
        {social.preferences.length > 0 && (
          <details className="chat-controls">
            <summary>Muted and blocked players</summary>
            {social.preferences.map((p) => (
              <div key={p.id}>
                <strong>{p.name}</strong>
                {p.muted && (
                  <button
                    disabled={remoteBusy}
                    onClick={() =>
                      void market('social-preference', {
                        target: p.id,
                        kind: 'mute',
                        enabled: false,
                      })
                    }
                  >
                    Unmute
                  </button>
                )}
                {p.blocked && (
                  <button
                    disabled={remoteBusy}
                    onClick={() =>
                      void market('social-preference', {
                        target: p.id,
                        kind: 'block',
                        enabled: false,
                      })
                    }
                  >
                    Unblock
                  </button>
                )}
              </div>
            ))}
          </details>
        )}
        {remoteError && (
          <p className="modal-error" role="alert">
            {remoteError}
          </p>
        )}
      </div>
    );
  return (
    <div className="rewards-panel">
      <span className="not-launched">
        GAME CREDITS LIVE · PAYOUTS NOT LAUNCHED
      </span>
      <div className="facility-summary">
        <span>
          <strong>{profile.credits}</strong> Compute
        </span>
        <span>
          <strong>{f.claims.length}</strong> story contracts
        </span>
        <span>
          <strong>{capacity(f)}</strong> facility capacity
        </span>
      </div>
      <p>
        Repairs, contracts, and deliveries earn Compute. Use them to build your
        facility, buy useful parts, and trade with other players.
      </p>
      <p>
        Noobius is intended to grow into P2E. The payout asset, funding pool,
        eligibility, and redemption rules are still undecided. Today’s Compute
        and capacity are not tokens, real compute, stock exposure, or a claim on
        future rewards.
      </p>
      <div className="token-note">
        A game worth playing comes first. Real-value payouts require a funded
        economy and a separate launch.
      </div>
      <button className="text-action" onClick={() => onPanel('contracts')}>
        Find your next contract <ArrowRight size={16} />
      </button>
    </div>
  );
}
