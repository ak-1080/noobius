'use client';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Cable,
  Check,
  ChevronRight,
  Coins,
  Cpu,
  Fan,
  Gamepad2,
  Headphones,
  LogOut,
  Menu,
  Map,
  Backpack,
  BriefcaseBusiness,
  MessageCircle,
  Minus,
  Plus,
  Radio,
  RotateCcw,
  Settings2,
  Sparkles,
  Trophy,
  Volume2,
  VolumeX,
  Wallet,
  Wrench,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { JOBS, nextRank, titleFor, UPGRADES, type JobType } from '@/lib/game';
import { api, useNoobius } from './useNoobius';
import Puzzle from './Puzzle';
import TitleScene from './TitleScene';
import Campus, { type CrewPerson } from './Campus';
import FacilityPanels, {
  PANEL_COPY,
  type ExpansionPanel,
} from './FacilityPanels';
import {
  ZONES,
  OBJECTS,
  STORY,
  newFacility,
  capacity,
  storyValue,
  type WorldObject,
} from '@/lib/facility';
const ICONS = { cooling: Fan, boot: Cpu, network: Cable };
type Panel =
  | ExpansionPanel
  | 'menu'
  | 'jobs'
  | 'wallet'
  | 'badge'
  | 'profile'
  | 'guide'
  | 'crew'
  | 'token'
  | 'locker'
  | 'report'
  | null;
type CrewEntry = { name: string; score: number; shifts: number; xp: number };
export default function NoobiusGame() {
  const game = useNoobius(),
    { profile, shift, mode, busy, error } = game;
  const [initialReveal, setInitialReveal] = useState(false);
  const [selectedObject, setSelectedObject] = useState<WorldObject | null>(
      null,
    ),
    [position, setPosition] = useState({ x: 0, z: 17 }),
    [people, setPeople] = useState<CrewPerson[]>([]),
    [zoomCommand, setZoomCommand] = useState(0),
    [travelCommand, setTravelCommand] = useState(0),
    [guideCommand, setGuideCommand] = useState<{
      id: string;
      revision: number;
    } | null>(null);
  const currentPosition = useRef(position);
  currentPosition.current = position;
  const facility = profile?.facility ?? newFacility();
  const [panel, setPanel] = useState<Panel>(null),
    [activeJob, setActiveJob] = useState<JobType | null>(null),
    [name, setName] = useState(''),
    [crew, setCrew] = useState<CrewEntry[]>([]),
    [crewLoading, setCrewLoading] = useState(false),
    [crewError, setCrewError] = useState(''),
    [muted, setMuted] = useState(true),
    [soundError, setSoundError] = useState('');
  const audio = useRef<AudioContext | null>(null),
    gain = useRef<GainNode | null>(null);
  const playing = mode !== 'lobby' && !!shift;
  const repaired =
    shift?.jobs.filter((j) => j.status === 'repaired').length ?? 0;
  const currentJob = shift?.jobs.find((j) => j.id === activeJob);
  const rankTarget = nextRank(profile?.xp ?? 0);
  const currentZone = ZONES.reduce(
    (best, z) =>
      Math.hypot(z.x - position.x, z.z - position.z) <
      Math.hypot(best.x - position.x, best.z - position.z)
        ? z
        : best,
    ZONES[0],
  );
  const nextContract = STORY.find((c) => !facility.claims.includes(c.id));
  useEffect(() => {
    if (!game.notice) return;
    const t = setTimeout(() => game.setNotice(''), 3500);
    return () => clearTimeout(t);
  }, [game.notice]);
  useEffect(() => {
    if (!playing) return;
    let alive = true;
    const refresh = async () => {
      try {
        if (profile?.wallet && profile.wallet !== 'practice')
          await api('presence', {
            ...currentPosition.current,
            expectedWallet: profile.wallet,
          });
        const d = await api<{ people: CrewPerson[] }>('campus');
        if (alive)
          setPeople(
            d.people.filter((p) => p.id !== profile?.wallet.slice(2, 18)),
          );
      } catch {
        /* Presence never replaces or blocks saved progress. */
      }
    };
    void refresh();
    const t = setInterval(refresh, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [playing, profile?.wallet]);
  useEffect(() => {
    if (!playing) return;
    const shortcut = (e: KeyboardEvent) => {
      if (
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(
          (e.target as HTMLElement)?.tagName,
        ) ||
        activeJob
      )
        return;
      if (e.key.toLowerCase() === 'm') {
        e.preventDefault();
        setPanel((p) => (p === 'map' ? null : 'map'));
      }
      if (e.key.toLowerCase() === 'i') {
        e.preventDefault();
        setPanel((p) => (p === 'inventory' ? null : 'inventory'));
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, [playing, activeJob]);

  useEffect(() => {
    if ((panel === 'badge' || panel === 'profile') && profile)
      setName(profile.name);
  }, [panel, profile?.wallet]);
  useEffect(() => {
    setActiveJob(null);
  }, [profile?.wallet]);
  useEffect(() => {
    return () => {
      void audio.current?.close();
    };
  }, []);
  useEffect(() => {
    if (!playing && gain.current)
      gain.current.gain.setTargetAtTime(0, audio.current!.currentTime, 0.1);
    else if (playing && !muted && gain.current)
      gain.current.gain.setTargetAtTime(0.006, audio.current!.currentTime, 0.1);
  }, [playing, muted]);
  useEffect(() => {
    if (panel !== 'crew') return;
    let alive = true;
    setCrewLoading(true);
    setCrewError('');
    api<{ entries: CrewEntry[] }>('leaderboard')
      .then((d) => {
        if (alive) setCrew(d.entries);
      })
      .catch((e) => {
        if (alive) setCrewError(e.message);
      })
      .finally(() => {
        if (alive) setCrewLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [panel]);
  const show = (p: Panel) => {
    game.setError('');
    if ((p === 'badge' || p === 'profile') && profile) setName(profile.name);
    setPanel(p);
  };
  const play = async () => {
    if (profile?.wallet === 'practice') {
      if (!game.resume()) game.startPractice();
      return;
    }
    if (profile) {
      if (game.resume()) return;
      if (await game.start()) setPanel(null);
    } else show('wallet');
  };
  const practice = () => {
    setPanel(null);
    setActiveJob(null);
    game.startPractice();
  };
  const station = async (job: JobType) => {
    if (busy || activeJob) return;
    const opened = await game.openJob(job);
    if (opened) {
      setInitialReveal(opened.initialReveal);
      setActiveJob(job);
    }
  };
  const interact = (object: WorldObject) => {
    setSelectedObject(object);
    if (object.kind === 'node') {
      void game.facilityAction({ type: 'gather', id: object.id });
      return;
    }
    if (object.kind === 'gate') {
      show('map');
      return;
    }
    if (object.kind === 'build') {
      show('facility');
      return;
    }
    show((object.panel ?? 'contracts') as Panel);
  };
  const earlyShift = !facility.claims.includes('first-light');
  const claimReady =
    !!nextContract &&
    storyValue(facility, nextContract.stat) >= nextContract.target;
  const starterAction = (() => {
    if (claimReady)
      return {
        text: `Collect ${nextContract!.credits} credits`,
        detail: 'Job done. Your next step is ready.',
        kind: 'claim',
      };
    if (!facility.claims.includes('welcome'))
      return {
        text: 'Find your first parts',
        detail: 'Click here. Noobius will take you there.',
        kind: 'gather',
        id: 'scrap-a',
      };
    if (facility.craft)
      return {
        text:
          Date.now() >= facility.craft.readyAt
            ? 'Collect your repair kit'
            : 'Your kit is being made…',
        detail: 'One kit gets your first rack started.',
        kind: 'collect',
      };
    if (!(facility.inventory.kit ?? 0)) {
      if ((facility.inventory.scrap ?? 0) < 6)
        return {
          text: 'Recover more scrap',
          detail: 'Your repair kit needs 6 scrap.',
          kind: 'gather',
          id:
            (facility.cooldowns['scrap-a'] ?? 0) > Date.now()
              ? 'scrap-c'
              : 'scrap-a',
        };
      if ((facility.inventory.copper ?? 0) < 3)
        return {
          text: 'Find copper cables',
          detail: 'Your repair kit needs 3 copper.',
          kind: 'gather',
          id: 'copper-a',
        };
      return {
        text: 'Make a repair kit',
        detail: 'Turn those parts into something useful.',
        kind: 'craft',
      };
    }
    if ((facility.inventory.copper ?? 0) < 4)
      return {
        text: 'Find the last cables',
        detail: 'Add 4 copper to connect your rack.',
        kind: 'gather',
        id: 'copper-a',
      };
    return {
      text: 'Bring your first rack online',
      detail: 'Install your kit. Make the lights green.',
      kind: 'build',
    };
  })();
  const followObjective = () => {
    if (claimReady) {
      void game.facilityAction({ type: 'claim', id: nextContract!.id });
      return;
    }
    if (!earlyShift) {
      show('contracts');
      return;
    }
    if (starterAction.kind === 'gather') {
      setGuideCommand({ id: starterAction.id!, revision: Date.now() });
      return;
    }
    if (starterAction.kind === 'collect') {
      void game.facilityAction({ type: 'collect' });
      return;
    }
    if (starterAction.kind === 'craft') {
      show('crafting');
      return;
    }
    setSelectedObject(OBJECTS.find((o) => o.id === 'rack-a')!);
    show('facility');
  };
  const closePuzzle = () => {
    setActiveJob(null);
    if (shift?.completedAt) setPanel('report');
  };
  const nextShift = async () => {
    setActiveJob(null);
    if (mode === 'practice' || profile?.wallet === 'practice') {
      game.startPractice();
      setPanel(null);
    } else if (await game.start()) setPanel(null);
  };
  const sound = async () => {
    try {
      if (!audio.current) {
        audio.current = new AudioContext();
        gain.current = audio.current.createGain();
        gain.current.gain.value = 0;
        gain.current.connect(audio.current.destination);
        for (const hz of [60, 120]) {
          const oscillator = audio.current.createOscillator();
          oscillator.type = 'sine';
          oscillator.frequency.value = hz;
          oscillator.connect(gain.current);
          oscillator.start();
        }
      }
      await audio.current.resume();
      const next = !muted;
      setMuted(next);
      gain.current!.gain.setTargetAtTime(
        next ? 0 : 0.006,
        audio.current.currentTime,
        0.1,
      );
      setSoundError('');
    } catch {
      setSoundError('Audio isn’t available in this browser.');
    }
  };
  const answer = async (value: unknown) => {
    const correct = await game.answer(activeJob!, value);
    if (correct && !muted && audio.current) {
      const osc = audio.current.createOscillator(),
        g = audio.current.createGain();
      osc.frequency.setValueAtTime(440, audio.current.currentTime);
      osc.frequency.exponentialRampToValueAtTime(
        880,
        audio.current.currentTime + 0.14,
      );
      g.gain.setValueAtTime(0.04, audio.current.currentTime);
      g.gain.exponentialRampToValueAtTime(
        0.001,
        audio.current.currentTime + 0.28,
      );
      osc.connect(g);
      g.connect(audio.current.destination);
      osc.start();
      osc.stop(audio.current.currentTime + 0.3);
    }
    return correct;
  };
  return (
    <div className={`noobius-app ${playing ? 'is-playing' : ''}`}>
      {!playing && <TitleScene />}
      {!playing && (
        <header className="game-header">
          <button
            className="wordmark"
            aria-label="Return to title screen"
            onClick={() => {
              setActiveJob(null);
              setPanel(null);
              game.setMode('lobby');
            }}
          >
            noobius<span>•</span>
          </button>
          <nav aria-label="Main navigation">
            <button onClick={() => show('guide')}>How to play</button>
            <button onClick={() => show('crew')}>Crew</button>
            <button onClick={() => show('token')}>$NOOBIUS</button>
          </nav>
          <Button
            className="connect-button"
            disabled={busy || game.initializing}
            onClick={() =>
              show(
                profile && profile.wallet !== 'practice' ? 'profile' : 'wallet',
              )
            }
          >
            <Wallet size={15} />
            {game.initializing
              ? 'Loading…'
              : profile && profile.wallet !== 'practice'
                ? profile.wallet.slice(0, 6) + '…' + profile.wallet.slice(-4)
                : 'Connect'}
          </Button>
        </header>
      )}
      {!playing ? (
        <main className="title-content">
          <span className="title-kicker">THE NIGHT SHIFT</span>
          <h1>
            noobius<span>.</span>
          </h1>
          <p>Someone has to keep the future online.</p>
          <Button
            className="play-button"
            onClick={play}
            disabled={busy || game.initializing}
          >
            {busy
              ? 'Clocking in…'
              : profile && shift && !shift.completedAt
                ? 'Resume shift'
                : 'Play now'}
            <ArrowRight size={20} />
          </Button>
          <button
            className="practice-button"
            onClick={practice}
            disabled={busy || game.initializing}
          >
            <Gamepad2 size={16} /> Practice shift
          </button>
          <span className="free-note">Free to play. No tokens required.</span>
        </main>
      ) : (
        <main className="play-world" aria-label="The Noobius night shift">
          <Campus
            key={profile?.wallet}
            facility={facility}
            paused={!!panel || !!activeJob || busy}
            people={people}
            onInteract={interact}
            onPosition={(x, z) => setPosition({ x, z })}
            zoomCommand={zoomCommand}
            travelCommand={travelCommand}
            guideCommand={guideCommand}
          />
          <button
            className="game-menu-button"
            aria-label="Open game menu"
            onClick={() => show('menu')}
          >
            <Menu size={21} />
          </button>
          <div className="campus-location">
            <strong>{currentZone.name}</strong>
            <span>
              {mode === 'practice'
                ? 'Practice · temporary progress'
                : 'Wallet progress saved'}
            </span>
          </div>
          <div
            className="shift-hud"
            aria-label={`${capacity(facility)} compute capacity. ${profile?.credits ?? 0} credits.`}
          >
            <span>
              <span className="status-dot" />
              {capacity(facility)} compute
            </span>
            <span>
              <Coins size={14} />
              {profile?.credits ?? 0} credits
            </span>
          </div>
          {nextContract && (
            <button
              className="objective-hud"
              onClick={followObjective}
              disabled={
                busy ||
                (earlyShift &&
                  starterAction.kind === 'collect' &&
                  !!facility.craft &&
                  Date.now() < facility.craft.readyAt)
              }
            >
              <span>
                {earlyShift ? 'YOUR FIRST RACK' : 'MARGO’S NEXT CONTRACT'}
              </span>
              <strong>
                {earlyShift || claimReady
                  ? starterAction.text
                  : nextContract.name}
              </strong>
              <small>
                {earlyShift
                  ? starterAction.detail
                  : `${Math.min(storyValue(facility, nextContract.stat), nextContract.target)}/${nextContract.target}`}{' '}
                <ArrowRight size={13} />
              </small>
            </button>
          )}
          <div className="campus-hotbar" aria-label="Campus tools">
            {[
              { id: 'map', name: 'Map', Icon: Map },
              { id: 'inventory', name: 'Backpack', Icon: Backpack },
              { id: 'crafting', name: 'Craft', Icon: Wrench },
              { id: 'contracts', name: 'Contracts', Icon: BriefcaseBusiness },
              { id: 'social', name: 'Crew', Icon: MessageCircle },
            ].map(({ id, name, Icon }) => (
              <button key={id} onClick={() => show(id as Panel)}>
                <Icon size={19} />
                <span>{name}</span>
              </button>
            ))}
          </div>
          <div className="campus-zoom">
            <button
              aria-label="Zoom in"
              onClick={() => setZoomCommand((n) => Math.abs(n) + 1)}
            >
              <Plus size={17} />
            </button>
            <button
              aria-label="Zoom out"
              onClick={() => setZoomCommand((n) => -Math.abs(n) - 1)}
            >
              <Minus size={17} />
            </button>
          </div>
          <div className="campus-help">
            Scroll to zoom · WASD to move · E to interact · R to rotate
          </div>
          {game.notice && (
            <div className="game-toast" role="status">
              <Check size={17} />
              {game.notice}
            </div>
          )}
        </main>
      )}
      {!playing && (
        <div className="screen-footer">
          <span>EARLY ACCESS · THE NIGHT SHIFT</span>
        </div>
      )}
      {(error || soundError) && (
        <div className="error-notice" role="alert">
          <span>{error || soundError}</span>
          <button
            aria-label="Dismiss message"
            onClick={() => {
              game.setError('');
              setSoundError('');
            }}
          >
            <X size={16} />
          </button>
        </div>
      )}
      <Dialog
        open={!!panel}
        onOpenChange={(open) => {
          if (!open) setPanel(null);
        }}
      >
        <DialogContent
          className={`noobius-modal ${panel === 'guide' ? 'guide-modal' : ''} ${panel && panel in PANEL_COPY ? 'expansion-modal' : ''}`}
        >
          <DialogTitle>
            {
              (
                {
                  ...Object.fromEntries(
                    Object.entries(PANEL_COPY).map(([k, v]) => [k, v[0]]),
                  ),
                  menu: 'On the night shift.',
                  jobs: 'Your repair jobs.',
                  wallet: 'Clock in.',
                  badge: 'Your employee badge.',
                  profile: 'Your employee badge.',
                  guide: 'The field guide.',
                  crew: 'The night-shift crew.',
                  token: 'A noob. A crew. A token.',
                  locker: 'The equipment locker.',
                  report:
                    repaired === 3 ? 'Shift complete.' : 'Incident report.',
                } as Record<string, string>
              )[panel ?? '']
            }
          </DialogTitle>
          <DialogDescription>
            {
              (
                {
                  ...Object.fromEntries(
                    Object.entries(PANEL_COPY).map(([k, v]) => [k, v[1]]),
                  ),
                  menu:
                    mode === 'practice'
                      ? 'Practice shift · Progress lasts until reload.'
                      : 'Your progress is saved to your wallet.',
                  jobs: 'Tap a station in the room, or open a job here.',
                  wallet:
                    'Connect your wallet to save your progress. No purchase or transaction required.',
                  badge: 'What should we put on your badge?',
                  profile: 'Your place on the night shift.',
                  guide: 'Everything you need for your first night on the job.',
                  crew: 'Each technician’s best completed shift. Practice shifts are not ranked.',
                  token: 'The community grows around Noobius.',
                  locker: 'Better tools. Same questionable technician.',
                  report:
                    repaired === 3
                      ? 'The future is online. You can breathe now.'
                      : 'Some faults are tomorrow’s problem. Your completed repairs still count.',
                } as Record<string, string>
              )[panel ?? '']
            }
          </DialogDescription>
          {profile?.facility && panel && panel in PANEL_COPY && (
            <FacilityPanels
              panel={panel as ExpansionPanel}
              profile={profile}
              selected={selectedObject}
              busy={busy}
              onAction={game.facilityAction}
              onMarket={game.marketAction}
              onPanel={(p) => show(p)}
              onTravel={() => {
                setTravelCommand((n) => n + 1);
                setPanel(null);
              }}
            />
          )}
          {panel === 'menu' && (
            <div className="pause-menu">
              <div className="menu-employee">
                <img src="/assets/noobius.jpeg" alt="Noobius" />
                <div>
                  <strong>{profile?.name}</strong>
                  <span>
                    {titleFor(profile?.xp ?? 0)} · {profile?.credits ?? 0}{' '}
                    credits
                  </span>
                </div>
              </div>
              <Button className="primary-action" onClick={() => setPanel(null)}>
                Back to the floor <ArrowRight size={18} />
              </Button>
              <div className="pause-options">
                <button onClick={() => show('facility')}>
                  <Cpu size={18} /> Build facility
                </button>
                <button onClick={() => show('market')}>
                  <Coins size={18} /> Parts exchange
                </button>
                <button onClick={() => show('skills')}>
                  <Sparkles size={18} /> Skills & outfits
                </button>
                <button onClick={() => show('rewards')}>
                  <Trophy size={18} /> Rewards
                </button>
                <button onClick={() => show('jobs')}>
                  <Wrench size={18} /> Repair dispatch
                </button>
                <button onClick={() => show('contracts')}>
                  <BriefcaseBusiness size={18} /> Contracts
                </button>
                <button onClick={() => show('locker')}>
                  <Wrench size={18} /> Equipment
                </button>
                <button onClick={() => show('guide')}>
                  <BookOpen size={18} /> How to play
                </button>
                <button onClick={() => show('crew')}>
                  <Trophy size={18} /> Crew board
                </button>
                <button
                  onClick={() =>
                    show(
                      profile && profile.wallet !== 'practice'
                        ? 'profile'
                        : 'wallet',
                    )
                  }
                >
                  <Wallet size={18} />
                  {mode === 'practice' ? 'Connect wallet' : 'My account'}
                </button>
                <button onClick={sound}>
                  {muted ? <VolumeX size={18} /> : <Volume2 size={18} />} Sound{' '}
                  {muted ? 'off' : 'on'}
                </button>
                <button
                  onClick={() => {
                    setActiveJob(null);
                    setPanel(null);
                    game.setMode('lobby');
                  }}
                >
                  <LogOut size={18} /> Title screen
                </button>
              </div>
              <p className="menu-controls">
                WASD / arrows to move · E to interact
                <br />
                Scroll to zoom · R to rotate · M map · I inventory.
              </p>
            </div>
          )}
          {panel === 'jobs' && (
            <>
              <p className="muted-small">
                Repair jobs earn credits, operations XP, and parts delivered to
                your bank. Your campus upgrades stay built between shifts.
              </p>
              {shift?.completedAt && (
                <Button
                  className="primary-action"
                  disabled={busy}
                  onClick={nextShift}
                >
                  Start another repair shift <ArrowRight size={17} />
                </Button>
              )}
              <div className="job-dock" aria-label="Repair stations">
                {JOBS.map((j, i) => {
                  const job = shift!.jobs.find((x) => x.id === j.id)!,
                    Icon = ICONS[j.id];
                  return (
                    <button
                      key={j.id}
                      className={`job-button ${job.status}`}
                      disabled={
                        busy ||
                        job.status === 'repaired' ||
                        job.status === 'failed'
                      }
                      onClick={() => {
                        setPanel(null);
                        void station(j.id);
                      }}
                      aria-label={`${j.title} — ${job.status}`}
                    >
                      <span className="job-number">
                        {job.status === 'repaired' ? (
                          <Check size={18} />
                        ) : job.status === 'failed' ? (
                          <X size={18} />
                        ) : (
                          i + 1
                        )}
                      </span>
                      <span>
                        <small>{j.department}</small>
                        <strong>{j.title}</strong>
                      </span>
                      <Icon size={19} />
                    </button>
                  );
                })}
              </div>
            </>
          )}
          {panel === 'wallet' && (
            <div className="wallet-flow">
              <div className="login-steps">
                <span>
                  <span>1</span> Connect
                </span>
                <ChevronRight size={14} />
                <span>
                  <span>2</span> Sign in
                </span>
                <ChevronRight size={14} />
                <span>
                  <span>3</span> Play
                </span>
              </div>
              {game.wallets.length ? (
                game.wallets.map((w) => (
                  <button
                    className="wallet-option"
                    key={w.id}
                    disabled={busy}
                    onClick={async () => {
                      if (await game.connect(w)) show('badge');
                    }}
                  >
                    <Wallet size={22} />
                    <strong>{w.name}</strong>
                    <span>
                      {busy ? 'Check wallet…' : 'Connect'}
                      <ChevronRight size={15} />
                    </span>
                  </button>
                ))
              ) : (
                <div className="wallet-empty">
                  <Wallet size={28} />
                  <h3>No wallet detected.</h3>
                  <p>
                    Use MetaMask or another Ethereum-compatible browser wallet.
                    On mobile, open this site in your wallet’s browser.
                  </p>
                  <a
                    className="outline-button"
                    href="https://metamask.io/download/"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Get MetaMask <ArrowRight size={15} />
                  </a>
                  <a
                    className="text-action"
                    href={`https://metamask.app.link/dapp/noobius-compute-crew.rivd609.chatgpt.site`}
                  >
                    Open in MetaMask <ChevronRight size={14} />
                  </a>
                </div>
              )}
              <div className="wallet-fine-print">
                You’ll sign a readable login message. No gas fee, token
                approval, or spending permission. Standard Ethereum accounts
                supported.
              </div>
              <button
                className="practice-button modal-practice"
                onClick={practice}
                disabled={busy || game.initializing}
              >
                <Gamepad2 size={16} /> Play a practice shift instead
              </button>
            </div>
          )}
          {(panel === 'badge' || panel === 'profile') && profile && (
            <div className="profile-panel">
              <div className="employee-card">
                <img
                  src="/assets/noobius.jpeg"
                  alt="Your Noobius employee portrait"
                />
                <div>
                  <span>NOOBIUS / FACILITY 01</span>
                  <strong>{profile.name}</strong>
                  <small>{titleFor(profile.xp)}</small>
                </div>
              </div>
              <label className="input-label" htmlFor="employee-name">
                Employee name
              </label>
              <input
                id="employee-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={20}
                autoComplete="off"
                placeholder="Your crew name"
              />
              <div className="profile-numbers">
                <span>
                  <strong>{profile.credits}</strong>credits
                </span>
                <span>
                  <strong>{profile.xp}</strong>XP
                </span>
                <span>
                  <strong>{profile.shifts}</strong>shifts
                </span>
              </div>
              {rankTarget ? (
                <>
                  <Progress
                    value={(profile.xp / rankTarget) * 100}
                    aria-label="Progress to next rank"
                  />
                  <p className="muted-small">
                    {rankTarget - profile.xp} XP to your next promotion.
                  </p>
                </>
              ) : (
                <p className="muted-small">
                  Shift Lead. Management is still not answering.
                </p>
              )}
              <Button
                className="primary-action"
                disabled={busy || name.trim().length < 2}
                onClick={async () => {
                  if (name !== profile.name && !(await game.rename(name)))
                    return;
                  if (await game.start()) setPanel(null);
                }}
              >
                {busy
                  ? 'Clocking in…'
                  : panel === 'badge'
                    ? 'Start your shift'
                    : 'Save & enter facility'}
                <ArrowRight size={18} />
              </Button>
              {panel === 'profile' && (
                <button
                  className="text-action"
                  disabled={busy}
                  onClick={async () => {
                    if (await game.logout()) setPanel(null);
                  }}
                >
                  <LogOut size={15} /> Disconnect wallet
                </button>
              )}
            </div>
          )}
          {panel === 'guide' && (
            <Tabs defaultValue="play">
              <TabsList className="guide-tabs">
                <TabsTrigger value="play">How to play</TabsTrigger>
                <TabsTrigger value="story">The story</TabsTrigger>
                <TabsTrigger value="credits">Credits & ranks</TabsTrigger>
              </TabsList>
              <TabsContent value="play">
                <div className="guide-copy">
                  <ol>
                    <li>
                      <strong>Clock in.</strong> Sign in with a wallet for saved
                      progress, or try a practice shift without one.
                    </li>
                    <li>
                      <strong>Explore the campus.</strong> Click a station to
                      walk there. Use WASD or arrow keys to move and E nearby to
                      interact. Scroll to zoom and press R to rotate. M opens
                      the map; I opens your backpack. Meet Margo or open
                      Contracts for the story.
                    </li>
                    <li>
                      <strong>Make the repair.</strong> Balance 100 cooling
                      units, repeat a GPU boot sequence, and match four network
                      connections. You have three attempts at each station.
                    </li>
                    <li>
                      <strong>Build something lasting.</strong> Salvage parts,
                      craft components, and install rack modules. Expand power
                      and cooling to open new departments. Your built racks stay
                      online between maintenance shifts.
                    </li>
                  </ol>
                  <p>
                    On touch screens, tap a station or a job button. Every
                    puzzle also supports keyboard controls.
                  </p>
                </div>
              </TabsContent>
              <TabsContent value="story">
                <div className="guide-story">
                  <img
                    src="/assets/noobius.jpeg"
                    alt="Noobius, your overworked AI data-center technician"
                  />
                  <p>
                    Everyone said AI would do all the work.
                    <br />
                    Then Noobius got hired.
                  </p>
                  <p>
                    Now the GPUs are overheating, the network is down, and
                    management has ordered another cluster. With a headset, a
                    wrench, and insufficient training, he clocks in anyway.
                  </p>
                  <p>
                    <strong>His mission: keep the future online.</strong>
                  </p>
                  <p className="muted-small">
                    Noobius is an independent fan project inspired by AI
                    infrastructure. It is not affiliated with or endorsed by
                    Nebius, NVIDIA, or Robinhood. Facility readings and jobs are
                    game simulations.
                  </p>
                </div>
              </TabsContent>
              <TabsContent value="credits">
                <div className="guide-copy">
                  <p>
                    Each repair earns <strong>25 credits + 20 XP</strong>.
                    Repair all three for an extra{' '}
                    <strong>25 credits + 40 XP</strong>: 100 credits and 100 XP
                    per full shift.
                  </p>
                  <p>
                    Spend credits on parts, rack modules, department access,
                    tools, and outfits. Locker equipment takes effect on your
                    next maintenance shift.
                  </p>
                  <div className="rank-list">
                    {[0, 100, 300, 600].map((xp) => (
                      <div key={xp}>
                        <span>{titleFor(xp)}</span>
                        <strong>{xp} XP</strong>
                      </div>
                    ))}
                  </div>
                  <p>
                    A ranked shift scores for repaired stations, fewer attempts,
                    and time spent on each opened job. The maximum is 1,500
                    points. Your best shift stays on the crew board.
                  </p>
                  <p>
                    Practice progress lasts until you reload. It does not
                    transfer into a wallet account or the leaderboard. Game
                    credits buy in-game goods, including other players’ listed
                    parts. They have no cash value and cannot be redeemed for
                    tokens or stocks.
                  </p>
                </div>
              </TabsContent>
              <div className="guide-links">
                <button onClick={() => show('crew')}>
                  Crew board <ArrowRight size={14} />
                </button>
                <button onClick={() => show('token')}>
                  $NOOBIUS status <ArrowRight size={14} />
                </button>
              </div>
            </Tabs>
          )}
          {panel === 'token' && (
            <div className="token-panel">
              <span className="not-launched">NOT LAUNCHED</span>
              <p>
                Noobius is being built toward P2E, with a separate reward pool
                planned for a later release. $NOOBIUS is planned as the
                community token around the character and game.
              </p>
              <p>
                There is no official contract address, token sale, or redemption
                program in this release. Game credits buy equipment inside the
                game; they are not $NOOBIUS and do not represent NBIS shares.
              </p>
              <div className="token-note">
                Play the game. Meet the crew. The first shift is free.
              </div>
              <button className="text-action" onClick={() => show('guide')}>
                Read the field guide <ArrowRight size={16} />
              </button>
            </div>
          )}
          {panel === 'crew' && (
            <div className="crew-panel">
              {crewLoading ? (
                <p className="empty-state">Checking the shift reports…</p>
              ) : crewError ? (
                <div className="empty-state">
                  <p>{crewError}</p>
                  <button
                    className="text-action"
                    onClick={() => {
                      setPanel(null);
                      setTimeout(() => setPanel('crew'), 0);
                    }}
                  >
                    Try again <RotateCcw size={14} />
                  </button>
                </div>
              ) : crew.length ? (
                <>
                  <div className="crew-row crew-labels">
                    <span>#</span>
                    <span>TECHNICIAN</span>
                    <span>BEST SHIFT</span>
                  </div>
                  {crew.map((p, i) => (
                    <div className="crew-row" key={i}>
                      <span>
                        {i === 0 ? (
                          <Trophy size={19} />
                        ) : (
                          String(i + 1).padStart(2, '0')
                        )}
                      </span>
                      <span>
                        <strong>{p.name}</strong>
                        <small>
                          {titleFor(p.xp)} · {p.shifts} shifts
                        </small>
                      </span>
                      <strong>{p.score.toLocaleString()}</strong>
                    </div>
                  ))}
                </>
              ) : (
                <div className="empty-state">
                  <Trophy size={38} />
                  <h3>The first badge could be yours.</h3>
                  <p>
                    Finish a shift with your wallet connected to join the crew
                    board.
                  </p>
                  <Button
                    className="primary-action"
                    onClick={() => show('wallet')}
                  >
                    Clock in <ArrowRight size={16} />
                  </Button>
                </div>
              )}
            </div>
          )}
          {panel === 'locker' && (
            <div className="locker">
              <div className="locker-balance">
                <Coins size={19} />
                <strong>{profile?.credits ?? 0}</strong> credits
              </div>
              {UPGRADES.map((u) => {
                const owned = !!profile?.equipment[u.id];
                return (
                  <div className="equipment-card" key={u.id}>
                    <div className="equipment-icon">
                      {u.id === 'scanner' ? (
                        <Fan size={25} />
                      ) : u.id === 'visor' ? (
                        <Headphones size={25} />
                      ) : (
                        <Cable size={25} />
                      )}
                    </div>
                    <div>
                      <h3>{u.name}</h3>
                      <p>{u.description}</p>
                      <small>{u.effect}</small>
                      <Button
                        className={owned ? 'owned-button' : 'outline-button'}
                        disabled={
                          busy || owned || (profile?.credits ?? 0) < u.price
                        }
                        onClick={() => game.upgrade(u.id)}
                      >
                        {owned ? (
                          <>
                            <Check size={15} /> Installed
                          </>
                        ) : (
                          <>
                            {u.price} credits <ChevronRight size={15} />
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
              <p className="muted-small">
                Equipment takes effect on your next shift. Credits are earned
                in-game and have no cash value.
              </p>
            </div>
          )}
          {panel === 'report' && shift && (
            <div className="shift-report">
              <div className="report-hero">
                <span>
                  <Check size={33} />
                </span>
                <strong>{shift.score.toLocaleString()}</strong>
                <small>SHIFT SCORE</small>
              </div>
              <div className="report-rewards">
                <span>
                  <strong>+{shift.credits}</strong>credits
                </span>
                <span>
                  <strong>+{shift.xp}</strong>XP
                </span>
                <span>
                  <strong>{repaired}/3</strong>repaired
                </span>
              </div>
              <div className="report-jobs">
                {JOBS.map((j) => (
                  <div key={j.id}>
                    <span>{j.title}</span>
                    {shift.jobs.find((x) => x.id === j.id)?.status ===
                    'repaired' ? (
                      <Check size={17} />
                    ) : (
                      <X size={17} />
                    )}
                  </div>
                ))}
              </div>
              <p className="muted-small">
                {mode === 'practice'
                  ? 'Practice shift. Connect your wallet for saved progress and ranked scores.'
                  : 'Progress saved. Your best completed shift appears on the crew board.'}
              </p>
              <Button
                className="primary-action"
                disabled={busy}
                onClick={nextShift}
              >
                Another shift <ArrowRight size={18} />
              </Button>
              <button className="outline-button" onClick={() => show('locker')}>
                <Wrench size={16} /> Open equipment locker
              </button>
            </div>
          )}
          {error && (
            <p className="modal-error" role="alert">
              {error}
            </p>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!activeJob}
        onOpenChange={(open) => {
          if (!open) closePuzzle();
        }}
      >
        <DialogContent className="noobius-modal puzzle-modal">
          <DialogTitle>
            {JOBS.find((j) => j.id === activeJob)?.title ?? 'Repair station'}
          </DialogTitle>
          <DialogDescription>
            {JOBS.find((j) => j.id === activeJob)?.incident ??
              'Keep the future online.'}
          </DialogDescription>
          {currentJob && shift && (
            <Puzzle
              key={shift.id + currentJob.id}
              initialReveal={initialReveal}
              job={currentJob}
              equipment={shift.equipment}
              busy={busy}
              onAnswer={answer}
              onHint={() => game.hint(activeJob!)}
              onClose={closePuzzle}
            />
          )}
          {error && (
            <p className="modal-error" role="alert">
              {error}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
