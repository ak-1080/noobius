'use client';
import { LockerPanel, WorldPanel, CrewJobPanel } from './TycoonPanels';
import {
  publicCampus,
  ownRoom,
  EMERGENCY_STATIONS,
  type SharedWorld,
  type WorldVisit,
} from '@/lib/multiplayer';
import ContractAddress from './ContractAddress';
import { BriefingCard, ComputeDesk, OutageRepair } from './ExperiencePanels';
import Onboarding from './Onboarding';
import { nextBriefing, shiftObjective } from '@/lib/experience';
import { activeIncident, OUTAGE_NAMES, storedComputeNow } from '@/lib/facility';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Navigation,
  Hammer,
  CircleHelp,
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
  RotateCcw,
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
import { resolveObjective, type NextStep } from '@/lib/objectives';
import {
  ZONES,
  newFacility,
  modules,
  type FacilityAction,
  type WorldObject,
} from '@/lib/facility';
const ICONS = { cooling: Fan, boot: Cpu, network: Cable };
type Panel =
  | ExpansionPanel
  | 'world'
  | 'appearance'
  | 'crewjob'
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
  | 'briefing'
  | 'compute'
  | 'outage'
  | null;
type CrewEntry = { name: string; score: number; shifts: number; xp: number };
export default function NoobiusGame() {
  const game = useNoobius(),
    { profile, shift, mode, busy, error } = game;
  const [initialReveal, setInitialReveal] = useState(false);
  const [now, setNow] = useState(Date.now);
  const [worldUnavailable, setWorldUnavailable] = useState(false);
  const [workEvent, setWorkEvent] = useState<{
    id: string;
    kind: string;
    revision: number;
  } | null>(null);
  const [celebration, setCelebration] = useState<{
    title: string;
    detail: string;
  } | null>(null);
  const pendingStep = useRef<NextStep | null>(null);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!celebration) return;
    const timer = setTimeout(() => setCelebration(null), 4800);
    return () => clearTimeout(timer);
  }, [celebration]);
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
  const facility = {
    ...(profile?.facility ?? newFacility()),
    compute: profile?.credits ?? 0,
  };
  const [room, setRoom] = useState('home');
  const [visit, setVisit] = useState<WorldVisit | null>(null);
  const [shared, setShared] = useState<SharedWorld | null>(null);
  const [connection, setConnection] = useState('Connecting');
  const inCampus = room.startsWith('campus-');
  const roomId =
    room === 'home' ? ownRoom(profile?.wallet ?? 'practice') : room;
  const campusFacility = publicCampus();
  for (const w of shared?.work ?? [])
    if (w.completedAt && w.station !== 'network')
      campusFacility.builds[w.station === 'power' ? 'rack-a' : 'rack-b'] = 3;
  const viewFacility = visit
    ? {
        ...visit.facility,
        outfit: facility.outfit,
        accessory: facility.accessory,
      }
    : inCampus
      ? {
          ...campusFacility,
          outfit: facility.outfit,
          accessory: facility.accessory,
        }
      : facility;
  useEffect(() => {
    setRoom('home');
    setVisit(null);
    setPeople([]);
  }, [profile?.wallet]);
  const goWorld = (next: string) => {
    setRoom(next);
    setVisit(null);
    setPeople([]);
    setShared(null);
    setPosition({ x: 0, z: 17 });
    setPanel(null);
    setGuideCommand(null);
    pendingStep.current = null;
  };
  const visitFacility = async (owner: string) => {
    try {
      const d = await api<WorldVisit>(
        'visit?owner=' + encodeURIComponent(owner),
      );
      setVisit(d);
      setRoom('home-' + owner);
      setPeople([]);
      setPosition({ x: 0, z: 17 });
      setPanel(null);
      setGuideCommand(null);
      pendingStep.current = null;
    } catch (e) {
      game.setError(
        e instanceof Error ? e.message : 'Could not enter this facility.',
      );
    }
  };
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
  const needsIdentity = playing && !facility.seen.includes('intro:identity');
  const repaired =
    shift?.jobs.filter((j) => j.status === 'repaired').length ?? 0;
  const currentJob = shift?.jobs.find((j) => j.id === activeJob);
  const rankTarget = nextRank(profile?.xp ?? 0);
  const objective = shiftObjective(facility, profile?.credits ?? 0, now);
  const briefing = nextBriefing(facility);
  const incident = activeIncident(facility, now);
  const storedCompute = storedComputeNow(facility, now);
  useEffect(() => {
    if (!game.notice) return;
    const t = setTimeout(() => game.setNotice(''), 3500);
    return () => clearTimeout(t);
  }, [game.notice]);
  useEffect(() => {
    if (!playing || !profile || profile.wallet === 'practice') {
      setConnection('Solo practice');
      return;
    }
    let alive = true,
      pending = false;
    const refresh = async () => {
      if (pending || document.hidden) return;
      pending = true;
      try {
        await api('presence', {
          ...currentPosition.current,
          room: roomId,
          expectedWallet: profile.wallet,
        });
        const d = await api<{ people: CrewPerson[]; world: SharedWorld }>(
          'campus?room=' + encodeURIComponent(roomId),
        );
        if (alive) {
          setPeople(
            d.people.filter((p) => p.id !== profile.wallet.slice(2, 18)),
          );
          setShared(d.world);
          setConnection('Connected');
        }
      } catch (e) {
        if (alive) {
          setConnection('Reconnecting…');
          setPeople([]);
          if (e instanceof Error && e.message.includes('room is full')) {
            setRoom('home');
            setVisit(null);
            game.setError(e.message);
          }
        }
      } finally {
        pending = false;
      }
    };
    void refresh();
    const timer = setInterval(refresh, 1500);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [playing, profile?.wallet, roomId]);
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
    pendingStep.current = null;
    setGuideCommand({ id: '', revision: Date.now() });
    setSelectedObject(null);
    setPanel((current) =>
      current === 'badge' && profile?.wallet && !playing ? current : null,
    );
  }, [profile?.wallet, playing]);
  useEffect(() => {
    if (
      playing &&
      !needsIdentity &&
      room === 'home' &&
      briefing &&
      briefing.id !== 'welcome' &&
      !panel &&
      !activeJob &&
      !busy
    )
      setPanel('briefing');
  }, [playing, needsIdentity, briefing?.id, panel, activeJob, busy]);
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
    } else {
      setPanel(null);
      game.startPractice();
    }
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
  const act = async (action: Omit<FacilityAction, 'requestId'>) => {
    const ok = await game.facilityAction(action);
    if (!ok) return;
    const target = action.type.startsWith('outage')
      ? (incident?.rack ?? 'margo')
      : action.type.startsWith('compute')
        ? (facility.workload?.rack ??
          Object.keys(facility.builds).find((id) => facility.builds[id] > 0) ??
          'margo')
        : action.type === 'craft' || action.type === 'collect'
          ? 'workbench'
          : action.type === 'utility'
            ? 'utilities'
            : action.type === 'claim' || action.type.startsWith('daily')
              ? 'margo'
              : action.type === 'bank'
                ? 'bank'
                : action.type === 'unlock'
                  ? 'gate-' + action.id
                  : (action.id ?? 'margo');
    setWorkEvent({ id: target, kind: action.type, revision: Date.now() });
    if (action.type === 'build')
      setCelebration({
        title:
          (facility.builds[action.id!] ?? 0)
            ? 'More power. Same noob.'
            : 'You brought a rack online!',
        detail: `${modules(facility) + 1} rack levels installed. Your progress stays built.`,
      });
    if (action.type === 'unlock')
      setCelebration({
        title: `${ZONES.find((z) => z.id === action.id)?.name} unlocked`,
        detail: 'New parts. New projects. Go take a look.',
      });
    if (action.type === 'daily-bonus')
      setCelebration({
        title:
          facility.workdays === 2
            ? 'After-hours gold unlocked!'
            : 'Daily card complete!',
        detail: '+25 Compute · +25 XP · Your stamp is permanent.',
      });
    if (
      action.type === 'compute-collect' ||
      action.type === 'compute-harvest' ||
      action.type === 'outage-fix'
    )
      setCelebration({
        title:
          action.type === 'outage-fix' ? 'Back online!' : 'Compute collected!',
        detail:
          action.type === 'outage-fix'
            ? '+40 compute · +20 XP'
            : action.type === 'compute-collect'
              ? `+${facility.workload?.reward ?? 0} compute. Keep building.`
              : `+${storedCompute} compute from your racks.`,
      });
    if (action.type === 'compute-upgrade')
      setCelebration({
        title: 'Output upgraded!',
        detail: 'Every rack now generates more compute.',
      });
    return ok;
  };
  const executeStep = (step: NextStep) => {
    if (step.wait || busy) return;
    pendingStep.current = null;
    setGuideCommand({ id: '', revision: Date.now() });
    setPanel(null);
    if (step.repair) {
      const job = shift?.jobs.find(
        (j) => j.status === 'pending' || j.status === 'active',
      );
      if (job) void station(job.id);
      else show('jobs');
      return;
    }
    // Radio rewards and storage are quick actions; work in the world gets a
    // short walk and its own animation instead of another catalog dialog.
    if (
      step.action &&
      ['claim', 'daily', 'daily-bonus', 'bank', 'coffee', 'unlock'].includes(
        step.action.type,
      )
    ) {
      void act(step.action);
      return;
    }
    if (step.target && !worldUnavailable) {
      pendingStep.current = step;
      setGuideCommand({ id: step.target, revision: Date.now() });
    } else if (step.action) void act(step.action);
    else if (step.panel) show(step.panel as Panel);
  };
  const interact = (object: WorldObject) => {
    if (visit) {
      game.setNotice(
        `${visit.name}’s facility. Equipment can only be changed by its owner.`,
      );
      return;
    }
    if (inCampus) {
      show(
        EMERGENCY_STATIONS.some((s) => s.object === object.id)
          ? 'crewjob'
          : object.id === 'bank'
            ? 'appearance'
            : 'world',
      );
      return;
    }
    setSelectedObject(object);
    if (pendingStep.current?.target === object.id) {
      const step = pendingStep.current;
      pendingStep.current = null;
      if (step.action) {
        void act(step.action);
        return;
      }
      if (step.panel) {
        show(step.panel as Panel);
        return;
      }
    }
    if (object.id === 'margo' && briefing?.id === 'welcome') {
      show('briefing');
      return;
    }
    if (incident?.rack === object.id) {
      show('outage');
      return;
    }
    if (object.kind === 'build' && (facility.builds[object.id] ?? 0) > 0) {
      show('compute');
      return;
    }
    if (object.kind === 'node') {
      void act({ type: 'gather', id: object.id });
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
  const followObjective = () => executeStep(objective);
  const continueBriefing = async (follow = true) => {
    if (!briefing || busy) return;
    if (!(await act({ type: 'intro', id: briefing.id }))) return;
    setPanel(null);
    if (follow) {
      const next = {
        ...facility,
        seen: [...facility.seen, 'intro:' + briefing.id],
      };
      executeStep(shiftObjective(next, profile?.credits ?? 0, Date.now()));
    }
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
            <a href="/story">The story</a>
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
          <ContractAddress onToken={() => show('token')} />
        </main>
      ) : (
        <main
          className="play-world"
          aria-label="The Noobius night shift"
          inert={needsIdentity}
        >
          <Campus
            key={`${profile?.wallet}:${room}`}
            facility={viewFacility}
            playerName={profile?.name}
            sharedCampus={inCampus}
            paused={needsIdentity || !!panel || !!activeJob || busy}
            people={people}
            onInteract={interact}
            onPosition={(x, z) => setPosition({ x, z })}
            zoomCommand={zoomCommand}
            travelCommand={travelCommand}
            guideCommand={guideCommand}
            objectiveId={room === 'home' ? objective.target : undefined}
            workEvent={workEvent}
            onUnavailable={() => setWorldUnavailable(true)}
            onCancelGuide={() => {
              pendingStep.current = null;
            }}
          />
          <button
            className="game-menu-button"
            aria-label="Open game menu"
            onClick={() => show('menu')}
          >
            <Menu size={21} />
          </button>
          <div className="campus-location">
            <strong>
              {visit
                ? `${visit.name}’s data center`
                : inCampus
                  ? `Shared campus ${room.slice(-1)}`
                  : 'Your data center'}
            </strong>
            <span>
              {mode === 'practice'
                ? 'Solo practice'
                : `${connection} · ${people.length + 1} here`}
            </span>
          </div>
          <div
            className="shift-hud"
            aria-label={`${profile?.credits ?? 0} Compute`}
          >
            <span>
              <Cpu size={15} />
              {profile?.credits ?? 0} Compute
            </span>
          </div>
          {room !== 'home' && (
            <button
              className="objective-hud"
              onClick={() => show(inCampus ? 'crewjob' : 'world')}
            >
              <span>{inCampus ? 'SHARED JOB' : 'VISITING'}</span>
              <strong>
                {inCampus
                  ? 'Bring the cluster back online'
                  : `${visit?.name}’s facility`}
              </strong>
              <small>
                {inCampus
                  ? 'Restore three stations with your crew.'
                  : 'Look around. Your own equipment is safe at home.'}
              </small>
              <span className="objective-action">
                {inCampus ? 'Join the repair' : 'Return home'}{' '}
                <ArrowRight size={15} />
              </span>
            </button>
          )}
          {room === 'home' && (
            <button
              className="objective-hud next-action"
              onClick={followObjective}
              disabled={busy || objective.wait}
              aria-label={`${objective.title}. ${objective.cta}`}
            >
              <span className="next-action-icon">
                <Navigation size={22} />
              </span>
              <span className="next-action-copy">
                <small>Next up</small>
                <strong>{objective.title}</strong>
              </span>
              <ArrowRight className="next-action-arrow" size={20} />
              <i className="objective-meter">
                <i style={{ width: `${objective.progress}%` }} />
              </i>
            </button>
          )}
          {room === 'home' && modules(facility) > 0 && (
            <button
              className={`compute-hud ${incident ? 'has-outage' : ''}`}
              disabled={busy}
              onClick={() =>
                incident
                  ? show('outage')
                  : facility.workload && now >= facility.workload.readyAt
                    ? void act({ type: 'compute-collect' })
                    : storedCompute > 0
                      ? void act({ type: 'compute-harvest' })
                      : show('compute')
              }
            >
              <Cpu size={17} />
              <span>
                {incident
                  ? 'Repair needed'
                  : facility.workload && now >= facility.workload.readyAt
                    ? `Collect +${facility.workload.reward}`
                    : storedCompute > 0
                      ? `Collect +${storedCompute}`
                      : 'Racks working'}
              </span>
              <ArrowRight size={15} />
            </button>
          )}
          {celebration && (
            <div className="milestone-toast" role="status">
              <Sparkles size={27} />
              <div>
                <strong>{celebration.title}</strong>
                <span>{celebration.detail}</span>
              </div>
            </div>
          )}
          <div className="campus-hotbar" aria-label="Campus tools">
            {[
              {
                id: inCampus ? 'crewjob' : 'facility',
                name: inCampus ? 'Team job' : 'Build',
                Icon: Hammer,
              },
              { id: 'inventory', name: 'Parts', Icon: Backpack },
              { id: 'world', name: 'Travel', Icon: Map },
              { id: 'appearance', name: 'Locker', Icon: Headphones },
            ]
              .filter(
                ({ id }) =>
                  !visit || ['world', 'appearance', 'social'].includes(id),
              )
              .map(({ id, name, Icon }) => (
                <button
                  key={id}
                  className={`dock-${id}`}
                  onClick={() => show(id as Panel)}
                >
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
          <button
            className="controls-help"
            aria-label="Controls and help"
            onClick={() => show('guide')}
          >
            <CircleHelp size={20} />
          </button>
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
      {needsIdentity && (
        <Onboarding
          key={profile?.wallet}
          name={profile?.name ?? ''}
          facility={facility}
          busy={busy}
          onName={game.rename}
          onWear={(type, id) => game.facilityAction({ type, id })}
          onComplete={async () => {
            if (!(await act({ type: 'intro', id: 'arrival' }))) return false;
            if (!(await act({ type: 'intro', id: 'identity' }))) return false;
            setPanel(null);
            setGuideCommand({ id: 'margo', revision: Date.now() });
            return true;
          }}
        />
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
        open={!!panel && !needsIdentity}
        onOpenChange={(open) => {
          if (!open) {
            if (panel === 'briefing' && briefing) void continueBriefing(false);
            else setPanel(null);
          }
        }}
      >
        <DialogContent
          className={`noobius-modal ${panel === 'appearance' ? 'locker-modal' : ''} ${panel === 'briefing' ? 'briefing-modal' : ''} ${panel === 'guide' ? 'guide-modal' : ''} ${panel && panel in PANEL_COPY ? 'expansion-modal' : ''}`}
        >
          <DialogTitle>
            {
              (
                {
                  ...Object.fromEntries(
                    Object.entries(PANEL_COPY).map(([k, v]) => [k, v[0]]),
                  ),
                  world: 'Travel',
                  appearance: 'Locker',
                  crewjob: 'Cluster down',
                  menu: 'Paused',
                  jobs: 'Repairs',
                  wallet: 'Clock in.',
                  badge: 'Your employee badge.',
                  profile: 'Your employee badge.',
                  guide: 'How to play',
                  crew: 'The night-shift crew.',
                  token: 'A noob. A crew. A token.',
                  locker: 'The equipment locker.',
                  report:
                    repaired === 3 ? 'Shift complete.' : 'Incident report.',
                  briefing: briefing?.title ?? 'Your next step.',
                  compute: 'Production',
                  outage: incident
                    ? OUTAGE_NAMES[incident.kind]
                    : 'All systems online.',
                } as Record<string, string>
              )[panel ?? '']
            }
          </DialogTitle>
          <DialogDescription
            className={panel === 'wallet' || panel === 'token' ? '' : 'sr-only'}
          >
            {
              (
                {
                  ...Object.fromEntries(
                    Object.entries(PANEL_COPY).map(([k, v]) => [k, v[1]]),
                  ),
                  world: 'Grow your own facility. Meet the crew next door.',
                  appearance: 'Same noob. Your style.',
                  crewjob: 'Three stations. One cluster. Work together.',
                  menu:
                    mode === 'practice'
                      ? 'Practice shift · Progress lasts until reload.'
                      : 'Your progress is saved to your wallet.',
                  jobs: 'Fix a system, earn Compute, then improve your data center.',
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
                  briefing: 'One step at a time. You’ve got this.',
                  compute:
                    'Build racks. Collect compute. Grow your data center.',
                  outage:
                    'Patch is on the radio. Follow the steps to restore service.',
                } as Record<string, string>
              )[panel ?? '']
            }
          </DialogDescription>
          {panel === 'world' && (
            <WorldPanel
              onConnect={() => show('wallet')}
              room={room}
              practice={mode === 'practice'}
              onGo={goWorld}
              onVisit={(id) => void visitFacility(id)}
            />
          )}
          {panel === 'appearance' && (
            <LockerPanel
              facility={facility}
              name={profile?.name ?? 'Noobius'}
              balance={profile?.credits ?? 0}
              busy={busy}
              onName={game.rename}
              onWear={(type, id) => game.facilityAction({ type, id })}
            />
          )}
          {panel === 'crewjob' && (
            <CrewJobPanel
              world={shared}
              now={now}
              busy={busy}
              onWalk={(id) => {
                setPanel(null);
                setGuideCommand({ id, revision: Date.now() });
              }}
              onWork={(station, finish) => {
                if (shared)
                  void game.marketAction('crew-work', {
                    room,
                    event: shared.event,
                    station,
                    finish,
                  });
              }}
              onClaim={() => {
                if (shared)
                  void game.marketAction('crew-claim', {
                    room,
                    event: shared.event,
                  });
              }}
            />
          )}
          {panel === 'briefing' && briefing && (
            <BriefingCard
              briefing={briefing}
              busy={busy}
              onContinue={() => void continueBriefing()}
              onSkip={async () => {
                if (await act({ type: 'intro-skip' })) setPanel(null);
              }}
            />
          )}
          {panel === 'compute' && (
            <ComputeDesk
              facility={facility}
              now={now}
              busy={busy}
              onAction={act}
              onStarted={() => setPanel(null)}
              onOutage={() => {
                if (incident)
                  executeStep({
                    title: '',
                    detail: '',
                    cta: '',
                    target: incident.rack,
                    panel: 'outage',
                  });
              }}
            />
          )}
          {panel === 'outage' && (
            <OutageRepair
              key={incident?.at ?? 'clear'}
              facility={facility}
              now={now}
              busy={busy}
              onAction={act}
              onDone={() => setPanel(null)}
            />
          )}
          {profile?.facility && panel && panel in PANEL_COPY && (
            <FacilityPanels
              panel={panel as ExpansionPanel}
              profile={profile}
              selected={selectedObject}
              busy={busy}
              onAction={act}
              onMarket={game.marketAction}
              onPanel={(p) => show(p)}
              key={panel}
              objective={objective}
              jobTab="story"
              onFollow={followObjective}
              onRepair={() => show('jobs')}
              onHelp={(request) =>
                executeStep(
                  resolveObjective(facility, profile.credits, now, request),
                )
              }
              onGuide={(object) =>
                executeStep({
                  title: object.name,
                  detail: '',
                  cta: '',
                  target: object.id,
                  action:
                    object.kind === 'node'
                      ? { type: 'gather', id: object.id }
                      : undefined,
                  panel: object.panel,
                })
              }
              onTravel={() => {
                pendingStep.current = null;
                setGuideCommand({ id: '', revision: Date.now() });
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
                    Compute
                  </span>
                </div>
              </div>
              <Button className="primary-action" onClick={() => setPanel(null)}>
                Resume <ArrowRight size={18} />
              </Button>
              <div className="pause-options">
                <button onClick={() => show('facility')}>
                  <Cpu size={18} /> Build
                </button>
                <button onClick={() => show('market')}>
                  <Coins size={18} /> Shop
                </button>
                <button onClick={() => show('skills')}>
                  <Sparkles size={18} /> Skills
                </button>
                <button onClick={() => show('social')}>
                  <MessageCircle size={18} />
                  Crew chat
                </button>
                <button onClick={() => show('jobs')}>
                  <Wrench size={18} /> Repairs
                </button>
                <button onClick={() => show('contracts')}>
                  <BriefcaseBusiness size={18} /> Jobs
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
          {panel === 'jobs' && shift && (
            <>
              <p className="muted-small">
                Each repair pays 40 Compute, and sends 2 spare parts to your
                locker. Fix all three for a 25-credit bonus. Your built racks
                stay online.
              </p>
              {shift?.completedAt && (
                <Button
                  className="primary-action"
                  disabled={busy}
                  onClick={nextShift}
                >
                  Get 3 new repair tickets <ArrowRight size={17} />
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
                  <strong>{profile.credits}</strong>Compute
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
                <TabsTrigger value="credits">Compute & ranks</TabsTrigger>
              </TabsList>
              <TabsContent value="play">
                <div className="guide-copy">
                  <ol>
                    <li>
                      <strong>Clock in.</strong> Sign in with a wallet for saved
                      progress, or try a practice shift without one.
                    </li>
                    <li>
                      <strong>Follow Margo’s next step.</strong> Click the job
                      card to find parts, make a repair kit, and bring your
                      first rack online. The glowing arrow marks your next stop.
                    </li>
                    <li>
                      <strong>Earn and expand.</strong> Open Jobs for quick
                      repairs. Each fix pays 40 Compute and spare parts. Use
                      them to build more rack levels and open new departments.
                    </li>
                    <li>
                      <strong>Make the next shift count.</strong> Daily jobs
                      fill your reward card. Complete it on 3 different days to
                      earn the gold shirt. Your stamps and built racks stay with
                      you; there is no streak to lose.
                    </li>
                  </ol>
                  <p>
                    Click or tap to walk. WASD / arrows also move Noobius; E
                    interacts nearby. Scroll to zoom, R rotates the view, M
                    opens the map, and I opens your backpack. On phones, use the
                    job card and tap the world. Every puzzle supports keyboard
                    controls.
                  </p>
                </div>
              </TabsContent>
              <TabsContent value="credits">
                <div className="guide-copy">
                  <p>
                    Each repair earns <strong>40 Compute + 20 XP</strong>.
                    Repair all three for an extra{' '}
                    <strong>25 Compute + 40 XP</strong>: 145 Compute and 100 XP
                    per full shift.
                  </p>
                  <p>
                    Spend Compute on parts, rack modules, department access,
                    tools, and outfits. Locker equipment takes effect on your
                    next maintenance shift.
                  </p>
                  <p>
                    Built racks generate stored compute every 15 seconds. Open
                    Compute to collect it, run bonus batches, or reinvest in
                    efficiency. If a rack goes red, follow Patch’s repair steps
                    for bonus compute. Use Travel to join crew emergencies or
                    visit a facility.
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
                    Compute buys in-game goods, including other players’ listed
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
                Noobius is being built toward P2E, with a player marketplace
                intended for a later release. $NOOBIUS is planned as the
                community token around the character and game.
              </p>
              <p>
                There is no official contract address, token sale, or redemption
                program in this release. Game Compute buys equipment inside the
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
                <strong>{profile?.credits ?? 0}</strong> Compute
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
                            {u.price} Compute <ChevronRight size={15} />
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
              <p className="muted-small">
                Equipment takes effect on your next shift. Compute is earned
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
                  <strong>+{shift.credits + repaired * 15}</strong>Compute
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
                onClick={() => {
                  setPanel(null);
                  followObjective();
                }}
              >
                Continue my project <ArrowRight size={18} />
              </Button>
              <p className="muted-small">
                Next: {objective.title}. Spare parts from these repairs are
                waiting in your locker.
              </p>
              <button className="outline-button" onClick={nextShift}>
                <Wrench size={16} /> Get more repair tickets
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
