'use client';
import TycoonBuildPanel, { TycoonGoals } from './TycoonBuildPanel';
import ItemIcon from './ItemIcon';
import { useEffect, useState } from 'react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  ITEMS,
  ZONES,
  OBJECTS,
  RECIPES,
  STORY,
  ORDERS,
  OUTFITS,
  buildCost,
  canPay,
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
} from '@/lib/facility';
import type { Profile } from '@/lib/game';
import { api } from './useNoobius';
import type { Objective } from '@/lib/objectives';
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
  contracts: ['Goals', 'A little win every day.'],
  facility: ['Build', 'More machines. More Compute.'],
  market: ['Shop', 'Buy parts or trade with players.'],
  skills: ['Your progress', 'Earn new skills.'],
  social: ['Crew chat', 'Say hello.'],
  rewards: ['Compute', 'Your game balance.'],
};
type Props = {
  panel: ExpansionPanel;
  profile: Profile;
  selected: WorldObject | null;
  busy: boolean;
  onAction: (a: Omit<FacilityAction, 'requestId'>) => Promise<unknown>;
  onMarket: (a: string, b: Record<string, unknown>) => Promise<unknown>;
  onPanel: (p: ExpansionPanel) => void;
  onTravel: () => void;
  objective: Objective;
  onFollow: () => void;
  onRepair: () => void;
  onHelp: (request: { items?: Bag; build?: string; recipe?: ItemId }) => void;
  onGuide: (object: WorldObject) => void;
  jobTab?: string;
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
  panel,
  profile,
  selected,
  busy,
  onAction,
  onMarket,
  onPanel,
  onTravel,
  objective,
  onFollow,
  onRepair,
  onHelp,
  onGuide,
  jobTab = 'story',
}: Props) {
  const f = profile.facility!,
    [now, setNow] = useState(Date.now),
    [quantity, setQuantity] = useState(1),
    [item, setItem] = useState<ItemId>('scrap'),
    [price, setPrice] = useState(10),
    [listings, setListings] = useState<any[]>([]),
    [messages, setMessages] = useState<any[]>([]),
    [chat, setChat] = useState(''),
    [online, setOnline] = useState(0),
    [remoteError, setRemoteError] = useState(''),
    [remoteBusy, setRemoteBusy] = useState(false),
    [tab, setTab] = useState('merchant'),
    [allContracts, setAllContracts] = useState(false),
    [muted, setMuted] = useState<string[]>([]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const load = async () => {
    try {
      if (panel === 'market') {
        const d = await api<{ listings: any[] }>('listings');
        setListings(d.listings);
      }
      if (panel === 'social') {
        const [d, p] = await Promise.all([
          api<{ messages: any[] }>('messages'),
          api<{ people: any[] }>('campus'),
        ]);
        setMessages(d.messages);
        setOnline(p.people.length);
      }
      setRemoteError('');
    } catch (e) {
      setRemoteError(
        e instanceof Error ? e.message : 'Connection interrupted.',
      );
    }
  };
  useEffect(() => {
    if (!['market', 'social'].includes(panel)) return;
    void load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [panel]);
  const action = async (a: Omit<FacilityAction, 'requestId'>) => {
    await onAction(a);
  };
  const market = async (a: string, b: Record<string, unknown>) => {
    setRemoteBusy(true);
    try {
      await onMarket(a, b);
      await load();
    } finally {
      setRemoteBusy(false);
    }
  };
  const ids = Object.keys(ITEMS) as ItemId[];
  if (panel === 'map')
    return (
      <div className="campus-directory">
        <div className="facility-summary">
          <span>
            <strong>{computePerTick(f) * 4}</strong> Compute / min
          </span>
          <span>
            <strong>{modules(f)}</strong> machine levels
          </span>
          <span>
            <strong>{f.unlocked.length}/7</strong> open
          </span>
        </div>
        <div className="directory-map">
          <div className="map-spine" />
          {ZONES.map((z) => (
            <button
              key={z.id}
              className={`map-department ${f.unlocked.includes(z.id) ? 'open' : 'locked'}`}
              style={
                {
                  left: `${50 + z.x * 1.47}%`,
                  top: `${15 + (z.z + 32) * 1.42}%`,
                  '--department-color': z.color,
                } as React.CSSProperties
              }
              disabled={busy}
              onClick={async () => {
                if (f.unlocked.includes(z.id)) {
                  if (await onAction({ type: 'travel', id: z.id })) onTravel();
                } else await action({ type: 'unlock', id: z.id });
              }}
            >
              <span>
                {f.unlocked.includes(z.id) ? (
                  <Zap size={18} />
                ) : (
                  <Lock size={17} />
                )}
              </span>
              <strong>{z.name}</strong>
              <small>
                {f.unlocked.includes(z.id)
                  ? 'Go'
                  : z.id === 'core' && !f.unlocked.includes('compute')
                    ? 'Open GPU room first'
                    : `${z.modules} machine levels · ${z.cost} Compute`}
              </small>
            </button>
          ))}
        </div>
        <p className="muted-small">Choose a room to travel or unlock.</p>
      </div>
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
        <Tabs defaultValue="bag">
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
                    <div className="inventory-item" key={id}>
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
        {!f.claims.includes('first-light') && (
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
        {f.craft && (
          <div className="fabrication-active">
            <Wrench size={24} />
            <span>
              <strong>{ITEMS[f.craft.recipe as ItemId].name}</strong>
              <small>
                {now < f.craft.readyAt
                  ? `${Math.ceil((f.craft.readyAt - now) / 1000)} seconds remaining`
                  : 'Ready at the bench'}
              </small>
            </span>
            <Button
              className="outline-button"
              disabled={busy || now < f.craft.readyAt}
              onClick={() => action({ type: 'collect' })}
            >
              Collect
            </Button>
          </div>
        )}
        <div className="recipe-list">
          {RECIPES.filter(
            (r) => f.claims.includes('first-light') || r.id === 'kit',
          ).map((r) => {
            const open =
              f.unlocked.includes(r.zone) &&
              skillLevel(f.skills.engineering) >= r.skill;
            return (
              <div className="recipe" key={r.id}>
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
                <Parts cost={r.cost} bag={f.inventory} />
                {open && !canPay(f.inventory, r.cost) && !f.craft && (
                  <button
                    className="find-parts-button"
                    onClick={() => onHelp({ recipe: r.id })}
                  >
                    Find the missing parts <ArrowRight size={14} />
                  </button>
                )}
                <div className="recipe-bottom">
                  <small>
                    {r.seconds}s · Engineering {r.skill}
                    {!f.unlocked.includes(r.zone)
                      ? ` · Open ${ZONES.find((z) => z.id === r.zone)?.name}`
                      : ''}
                  </small>
                  <Button
                    disabled={
                      busy || !!f.craft || !open || !canPay(f.inventory, r.cost)
                    }
                    className="outline-button"
                    onClick={() => action({ type: 'craft', id: r.id })}
                  >
                    {!open ? <Lock size={14} /> : <Wrench size={14} />} Make{' '}
                    {r.name.toLowerCase()} · {r.seconds}s
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
      <TycoonGoals
        facility={f}
        busy={busy}
        onAction={onAction}
        onFollow={onFollow}
      />
    );
  if (panel === 'facility')
    return (
      <TycoonBuildPanel
        facility={f}
        balance={profile.credits}
        busy={busy}
        selected={selected?.id}
        onAction={onAction}
        onExpand={() => onPanel('map')}
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
                  disabled={busy || profile.credits < ITEMS[id].buy * quantity}
                  onClick={() => action({ type: 'buy', item: id, quantity })}
                >
                  Buy {ITEMS[id].buy * quantity}
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
          {listings.length ? (
            listings.map((l) => (
              <div className="player-listing" key={l.id}>
                <div>
                  <strong>
                    {l.quantity} × {ITEMS[l.item as ItemId]?.name ?? l.item}
                  </strong>
                  <small>
                    Listed by {l.name} · {l.price} Compute total
                  </small>
                </div>
                <Button
                  className="outline-button"
                  disabled={busy || remoteBusy || profile.wallet === 'practice'}
                  onClick={() =>
                    market(
                      l.owner === profile.wallet.slice(2, 18)
                        ? 'listing-cancel'
                        : 'listing-buy',
                      { id: l.id },
                    )
                  }
                >
                  {l.owner === profile.wallet.slice(2, 18) ? 'Cancel' : 'Buy'}
                </Button>
              </div>
            ))
          ) : (
            <div className="empty-state">
              <Package size={30} />
              <p>No player listings yet. The parts merchant is always open.</p>
            </div>
          )}
        </TabsContent>
        <TabsContent value="sell">
          <div className="listing-form">
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
                profile.wallet === 'practice' ||
                (f.inventory[item] ?? 0) < quantity
              }
              onClick={async () => {
                await market('listing-create', { item, quantity, price });
                setTab('players');
              }}
            >
              List items <ArrowRight size={16} />
            </Button>
            <p className="muted-small">
              Up to 10 open listings. Cancelled items return to your locker.
              Sales transfer existing Compute between players.
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
            Practice players can read the crew channel. Connect a wallet to join
            it.
          </p>
        )}
        <div className="chat-messages" role="log" aria-label="Crew messages">
          {messages
            .filter((m) => !muted.includes(m.name))
            .map((m) => (
              <div className="chat-message" key={m.id}>
                <div>
                  <strong>{m.name}</strong>
                  <small>
                    {new Date(m.created_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </small>
                  <button
                    onClick={() => setMuted([...muted, m.name])}
                    aria-label={'Mute ' + m.name}
                  >
                    Mute
                  </button>
                </div>
                <p>{m.message}</p>
              </div>
            ))}
          {!messages.length && (
            <p className="empty-state">
              Quiet on the night shift. Say hello to the next technician.
            </p>
          )}
        </div>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!chat.trim() || remoteBusy) return;
            setRemoteBusy(true);
            try {
              await api('message', {
                message: chat.trim(),
                expectedWallet: profile.wallet,
              });
              setChat('');
              await load();
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
          Never share seed phrases or private information. Mutes last for this
          visit. Public moderation and reporting are launch requirements.
        </p>
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
