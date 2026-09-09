'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  applyFacility,
  newFacility,
  repairLoot,
  type FacilityAction,
} from '@/lib/facility';
import { signInWallet } from '@/lib/wallet';
import { facilityReceipt, type FacilityReceipt } from '@/lib/game-feedback';
import {
  GUEST_SAVE_KEY,
  GuestSaveStore,
  persistGuestSave,
} from '@/lib/guest-save';
import {
  activateJob,
  answerJob,
  guestProfile,
  hintJob,
  newShift,
  UPGRADES,
  type JobType,
  type Profile,
  type Shift,
  type Upgrade,
} from '@/lib/game';
import {
  mergeWalletOption,
  legacyWalletName,
  type Provider,
  type WalletOption,
} from '@/lib/wallet-options';
export type { Provider, WalletOption } from '@/lib/wallet-options';
declare global {
  interface Window {
    ethereum?: Provider;
  }
}
export class ClientError extends Error {
  constructor(
    message: string,
    public status = 0,
  ) {
    super(message);
  }
}
export type GameData = {
  receipt?: FacilityReceipt | null;
  actionApplied?: boolean;
  profile: Profile | null;
  shift: Shift | null;
  correct?: boolean;
  initialReveal?: boolean;
  ok?: boolean;
  message?: string;
};
export async function api<T = GameData>(
  action: string,
  body?: unknown,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch('/api/noobius/' + action, {
      method: body === undefined ? 'GET' : 'POST',
      headers:
        body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new ClientError(
      'Connection interrupted. Your saved progress is safe; please retry.',
    );
  }
  let data: Record<string, unknown>;
  try {
    data = (await response.json()) as Record<string, unknown>;
  } catch {
    throw new ClientError(
      'The facility is temporarily unavailable. Please try again.',
      response.status,
    );
  }
  if (!response.ok)
    throw new ClientError(
      typeof data.error === 'string'
        ? data.error
        : 'Something went wrong. Please try again.',
      response.status,
    );
  return data as T;
}
export function useNoobius() {
  const worldController = useRef<{clientId: string; generation: number} | null>(null);
  const setWorldController = useCallback((value: {clientId: string; generation: number} | null) => { worldController.current = value; }, []);
  const [notice, setNotice] = useState('');
  const [guestSaveState, setGuestSaveState] = useState<
    'saved' | 'unavailable' | 'checking'
  >('checking');
  const guestStore = useRef<GuestSaveStore | null>(null);
  if (!guestStore.current)
    guestStore.current = new GuestSaveStore(() => window.localStorage);
  const [profile, setProfile] = useState<Profile | null>(null),
    [shift, setShift] = useState<Shift | null>(null),
    [mode, setMode] = useState<'lobby' | 'practice' | 'wallet'>('lobby'),
    [wallets, setWallets] = useState<WalletOption[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [initializing, setInitializing] = useState(true);
  const state = useRef({ profile, shift, mode });
  state.current = { profile, shift, mode };
  const providerRef = useRef<Provider | null>(null),
    listeners = useRef<(() => void) | null>(null),
    pending = useRef<{ key: string; id: string } | null>(null),
    inFlight = useRef(false);
  const generation = useRef(0),
    operationGeneration = useRef(0);
  const appliedRevision = useRef(0);
  const apply = useCallback(
    (
      data: { profile: Profile | null; shift: Shift | null },
      epoch = operationGeneration.current,
    ) => {
      if (epoch !== generation.current) return;
      appliedRevision.current++;
      state.current = {
        ...state.current,
        profile: data.profile,
        shift: data.shift,
      };
      setProfile(data.profile);
      setShift(data.shift);
    },
    [],
  );
  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      const wallet = state.current.profile?.wallet;
      if (
        !wallet ||
        wallet === 'practice' ||
        document.hidden ||
        inFlight.current
      )
        return;
      const epoch = generation.current,
        revision = appliedRevision.current;
      try {
        const data = await api('profile');
        if (
          !alive ||
          epoch !== generation.current ||
          revision !== appliedRevision.current ||
          inFlight.current
        )
          return;
        if (!data.profile || data.profile.wallet !== wallet) {
          generation.current++;
          appliedRevision.current++;
          state.current = { profile: null, shift: null, mode: 'lobby' };
          setProfile(null);
          setShift(null);
          setMode('lobby');
          setError(
            'Your sign-in changed or expired. Reconnect to continue your saved game.',
          );
        } else if (
          (data.profile.facility?.version ?? 0) >=
          (state.current.profile?.facility?.version ?? 0)
        )
          apply(data, epoch);
      } catch {
        /* A background refresh must not interrupt an active game. */
      }
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    const timer = setInterval(refresh, 60000);
    return () => {
      alive = false;
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
      clearInterval(timer);
    };
  }, [apply]);
  useEffect(() => {
    let alive = true;
    const epoch = generation.current,
      revision = appliedRevision.current;
    api('profile')
      .then((data) => {
        if (
          !alive ||
          epoch !== generation.current ||
          revision !== appliedRevision.current
        )
          return;
        if (data.profile) apply(data, epoch);
        else {
          const local = guestStore.current!.read();
          setGuestSaveState(
            local.issue === 'unavailable' || local.issue === 'newer'
              ? 'unavailable'
              : 'saved',
          );
          if (local.snapshot) apply(local.snapshot, epoch);
          else if (local.issue === 'invalid')
            setNotice(
              'The local save could not be read. You can start a new practice game.',
            );
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setInitializing(false);
      });
    let found: WalletOption[] = [];
    const add = (
      id: string,
      name: string,
      provider: Provider,
      rdns?: string,
    ) => {
      found = mergeWalletOption(found, { id, name, provider, rdns });
      setWallets(found);
    };
    const announce = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (
        detail &&
        typeof detail.info?.uuid === 'string' &&
        typeof detail.info?.name === 'string'
      )
        add(
          detail.info.uuid,
          detail.info.name.slice(0, 40),
          detail.provider,
          typeof detail.info.rdns === 'string'
            ? detail.info.rdns.slice(0, 255)
            : undefined,
        );
    };
    window.addEventListener('eip6963:announceProvider', announce);
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    const fallback = setTimeout(() => {
      const p = window.ethereum;
      if (p) {
        for (const provider of p.providers ?? [p])
          add('injected' + found.length, legacyWalletName(provider), provider);
      }
    }, 300);
    return () => {
      alive = false;
      clearTimeout(fallback);
      window.removeEventListener('eip6963:announceProvider', announce);
      listeners.current?.();
    };
  }, [apply]);
  useEffect(() => {
    if (initializing || profile?.wallet !== 'practice') return;
    let alive = true;
    const epoch = generation.current,
      revision = appliedRevision.current;
    const isCurrent = () =>
      alive &&
      epoch === generation.current &&
      revision === appliedRevision.current &&
      state.current.profile === profile &&
      state.current.shift === shift;
    setGuestSaveState('checking');
    void persistGuestSave(
      guestStore.current!,
      profile,
      shift,
      isCurrent,
      navigator.locks,
    ).then((result) => {
      if (!isCurrent()) return;
      if (result.kind === 'conflict') {
        generation.current++;
        apply(
          result.snapshot ?? { profile: null, shift: null },
          generation.current,
        );
        setMode('lobby');
        setError(
          'Your game changed in another tab. The latest save is ready—choose Continue to pick up there.',
        );
      } else if (result.kind !== 'ignored') {
        setGuestSaveState(result.kind === 'saved' ? 'saved' : 'unavailable');
      }
    });
    return () => {
      alive = false;
    };
  }, [profile, shift, initializing, apply]);
  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (
        (event.key !== GUEST_SAVE_KEY && event.key !== null) ||
        state.current.profile?.wallet !== 'practice' ||
        inFlight.current
      )
        return;
      const local = guestStore.current!.read();
      if (local.issue) {
        setGuestSaveState('unavailable');
        return;
      }
      generation.current++;
      apply(
        local.snapshot ?? { profile: null, shift: null },
        generation.current,
      );
      setMode('lobby');
      setError(
        'Your game changed in another tab. The latest save is ready—choose Continue to pick up there.',
      );
    };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, [apply]);
  const run = useCallback(
    async <T>(fn: () => Promise<T>): Promise<T | undefined> => {
      if (inFlight.current) return;
      inFlight.current = true;
      setBusy(true);
      setError('');
      operationGeneration.current = generation.current;
      try {
        return await fn();
      } catch (e) {
        if (operationGeneration.current !== generation.current) return;
        setError(
          e instanceof Error
            ? e.message
            : 'Something went wrong. Please try again.',
        );
        if (e instanceof ClientError && e.status === 401) {
          generation.current++;
          appliedRevision.current++;
          state.current = { profile: null, shift: null, mode: 'lobby' };
          setMode('lobby');
          setProfile(null);
          setShift(null);
        }
        if (e instanceof ClientError && e.status === 409) {
          const wallet = state.current.profile?.wallet;
          try {
            const fresh = await api('profile');
            if (wallet && fresh.profile?.wallet === wallet) apply(fresh);
          } catch {
            /* Keep the existing error and allow a safe retry. */
          }
        }
        return;
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    },
    [apply],
  );
  const connect = async (option: WalletOption) =>
    run(async () => {
      const p = option.provider;
      const { data, address } = await signInWallet(
        p,
        (address, chainId) =>
          api<{ message: string }>('nonce', { address, chainId }),
        (signature) => api('verify', { signature }),
      );
      if (operationGeneration.current !== generation.current) return;
      apply(data);
      setMode('lobby');
      pending.current = null;
      try {
        localStorage.setItem('noobius-wallet', option.name);
      } catch {
        /* Remembering the provider is optional. */
      }
      listeners.current?.();
      providerRef.current = p;
      const changed = (accounts?: unknown) => {
        if (
          Array.isArray(accounts) &&
          accounts[0]?.toLowerCase() === address.toLowerCase()
        )
          return;
        generation.current++;
        setProfile(null);
        setShift(null);
        setMode('lobby');
        setError(
          'Wallet changed. Reconnect to load the correct employee badge.',
        );
        void api('logout', { expectedWallet: address.toLowerCase() }).catch(
          () => {},
        );
      };
      p.on?.('accountsChanged', changed);
      p.on?.('chainChanged', changed);
      listeners.current = () => {
        p.removeListener?.('accountsChanged', changed);
        p.removeListener?.('chainChanged', changed);
      };
      return true;
    });

  useEffect(() => {
    if (
      !profile ||
      profile.wallet === 'practice' ||
      !wallets.length ||
      providerRef.current
    )
      return;
    let alive = true;
    let remembered: string | null = null;
    try {
      remembered = localStorage.getItem('noobius-wallet');
    } catch {
      /* Wallet discovery still works without browser storage. */
    }
    const chosen = wallets.find((w) => w.name === remembered);
    if (!chosen) return;
    const p = chosen.provider;
    const changed = (accounts?: unknown) => {
      if (
        Array.isArray(accounts) &&
        accounts[0]?.toLowerCase() === profile.wallet
      )
        return;
      generation.current++;
      setProfile(null);
      setShift(null);
      setMode('lobby');
      setError('Wallet changed. Reconnect to load the correct employee badge.');
      void api('logout', { expectedWallet: profile.wallet }).catch(() => {});
    };
    p.request({ method: 'eth_accounts' })
      .then((accounts) => {
        if (!alive) return;
        if (
          Array.isArray(accounts) &&
          accounts[0]?.toLowerCase() === profile.wallet
        ) {
          providerRef.current = p;
          p.on?.('accountsChanged', changed);
          p.on?.('chainChanged', changed);
          listeners.current = () => {
            p.removeListener?.('accountsChanged', changed);
            p.removeListener?.('chainChanged', changed);
            providerRef.current = null;
          };
        } else changed(accounts);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [profile?.wallet, wallets]);
  const logout = () =>
    run(async () => {
      await api('logout', { expectedWallet: state.current.profile?.wallet });
      generation.current++;
      listeners.current?.();
      providerRef.current = null;
      setProfile(null);
      setShift(null);
      setMode('lobby');
      return true;
    });
  const startPractice = () => {
    if (inFlight.current || initializing) return;
    generation.current++;
    listeners.current?.();
    providerRef.current = null;
    setError('');
    const local =
      state.current.profile?.wallet === 'practice'
        ? null
        : guestStore.current!.read();
    const p =
      state.current.profile?.wallet === 'practice'
        ? state.current.profile
        : (local?.snapshot?.profile ?? guestProfile());
    const savedShift = local?.snapshot?.shift;
    apply(
      {
        profile: p,
        shift:
          savedShift && !savedShift.completedAt
            ? savedShift
            : newShift(p.equipment),
      },
      generation.current,
    );
    setMode('practice');
  };
  const start = () =>
    run(async () => {
      if (state.current.profile?.wallet === 'practice') {
        const p = state.current.profile;
        setShift(newShift(p.equipment));
        setMode('practice');
        return true;
      }
      const data = await api('start', {
        expectedWallet: state.current.profile?.wallet,
      });
      if (operationGeneration.current !== generation.current) return;
      apply(data);
      setMode('wallet');
      return true;
    });
  const resume = () => {
    if (
      state.current.profile &&
      state.current.shift &&
      !state.current.shift.completedAt &&
      Date.now() - state.current.shift.startedAt < 86400000
    ) {
      setMode(
        state.current.profile.wallet === 'practice' ? 'practice' : 'wallet',
      );
      return true;
    }
    return false;
  };
  const openJob = async (job: JobType) =>
    run(async () => {
      const s = state.current.shift;
      if (!s) return;
      if (
        s.jobs.find((j) => j.id === job)?.status === 'repaired' ||
        s.jobs.find((j) => j.id === job)?.status === 'failed'
      )
        return false;
      if (state.current.mode === 'practice') {
        const initialReveal =
          s.jobs.find((j) => j.id === job)?.status === 'pending';
        setShift(activateJob(s, job));
        return { initialReveal };
      }
      const data = await api('activate', {
        shiftId: s.id,
        job,
        expectedWallet: state.current.profile?.wallet,
      });
      if (operationGeneration.current !== generation.current) return;
      apply(data);
      return { initialReveal: !!data.initialReveal };
    });
  const answer = async (job: JobType, answer: unknown) =>
    run(async () => {
      const current = state.current,
        s = current.shift;
      if (!s) return;
      const key = JSON.stringify([s.id, job, answer]);
      if (pending.current?.key !== key)
        pending.current = { key, id: crypto.randomUUID() };
      let correct: boolean;
      if (current.mode === 'practice') {
        const next = answerJob(s, job, answer, pending.current.id);
        setShift(next.shift);
        correct = next.correct;
        setProfile((p) =>
          p
            ? {
                ...p,
                credits:
                  p.credits +
                  next.shift.credits -
                  s.credits +
                  (correct &&
                  s.jobs.find((j) => j.id === job)?.status !== 'repaired'
                    ? 15
                    : 0),
                xp: p.xp + next.shift.xp - s.xp,
                shifts:
                  p.shifts + (!s.completedAt && next.shift.completedAt ? 1 : 0),
                bestScore: next.shift.completedAt
                  ? Math.max(p.bestScore, next.shift.score)
                  : p.bestScore,
                facility:
                  correct &&
                  s.jobs.find((j) => j.id === job)?.status !== 'repaired'
                    ? repairLoot(p.facility ?? newFacility(), job)
                    : p.facility,
              }
            : p,
        );
      } else {
        const data = await api('answer', {
          shiftId: s.id,
          job,
          answer,
          requestId: pending.current.id,
          expectedWallet: state.current.profile?.wallet,
        });
        apply(data);
        correct = !!data.correct;
      }
      pending.current = null;
      return correct;
    });
  const hint = async (job: JobType) =>
    run(async () => {
      const s = state.current.shift;
      if (!s) return;
      if (state.current.mode === 'practice') {
        const next = hintJob(s, job);
        setShift(next);
        return true;
      }
      apply(
        await api('hint', {
          shiftId: s.id,
          job,
          expectedWallet: state.current.profile?.wallet,
        }),
      );
      return true;
    });
  const upgrade = async (id: Upgrade) =>
    run(async () => {
      if (state.current.mode === 'practice') {
        const item = UPGRADES.find((u) => u.id === id)!,
          p = state.current.profile!;
        if (p.equipment[id] || p.credits < item.price)
          throw new Error('You need more credits for this equipment.');
        setProfile({
          ...p,
          credits: p.credits - item.price,
          equipment: { ...p.equipment, [id]: true },
        });
        return true;
      }
      apply(
        await api('upgrade', {
          upgrade: id,
          expectedWallet: state.current.profile?.wallet,
        }),
      );
      return true;
    });
  const rename = async (name: string) =>
    run(async () => {
      if (!/^[A-Za-z0-9 _-]{2,20}$/.test(name.trim()))
        throw new Error(
          'Use 2–20 letters, numbers, spaces, dashes, or underscores.',
        );
      if (state.current.profile?.wallet === 'practice') {
        apply({
          profile: { ...state.current.profile, name: name.trim() },
          shift: state.current.shift,
        });
        return true;
      }
      apply(
        await api('name', {
          name,
          expectedWallet: state.current.profile?.wallet,
        }),
      );
      return true;
    });
  const facilityAction = async (action: Omit<FacilityAction, 'requestId'>) =>
    run(async () => {
      const p = state.current.profile;
      if (!p) return;
      const epoch = generation.current;
      const key = JSON.stringify(['facility', action]);
      if (pending.current?.key !== key)
        pending.current = { key, id: crypto.randomUUID() };
      const a = { ...action, requestId: pending.current.id } as FacilityAction;
      let data: GameData;
      if (p.wallet === 'practice') {
        const before = p.facility ?? newFacility();
        const next = applyFacility(before, a, p.credits);
        data = {
          profile: {
            ...p,
            facility: next.facility,
            credits: p.credits + next.credits,
            xp: p.xp + next.xp,
          },
          shift: state.current.shift,
          receipt: facilityReceipt(before, a, next),
          actionApplied: !before.requests.includes(a.requestId),
          message: next.message,
        };
      } else {
        data = await api('facility', {
          ...worldController.current,
          action: a,
          expectedWallet: p.wallet,
        });
      }
      if (
        epoch !== generation.current ||
        state.current.profile?.wallet !== p.wallet
      )
        return;
      apply(data, epoch);
      setNotice(data.receipt ? '' : (data.message ?? 'Saved.'));
      pending.current = null;
      return {
        receipt: data.receipt ?? null,
        applied: data.actionApplied !== false,
      };
    });
  const marketAction = async (action: string, body: Record<string, unknown>) =>
    run(async () => {
      if (state.current.profile?.wallet === 'practice') {
        setError(
          'Connect a wallet to trade with the crew. The parts merchant works in practice.',
        );
        return;
      }
      const key = JSON.stringify([action, body]);
      if (pending.current?.key !== key)
        pending.current = { key, id: crypto.randomUUID() };
      const data = await api(action, {
        ...worldController.current,
        ...body,
        requestId: pending.current.id,
        expectedWallet: state.current.profile?.wallet,
      });
      apply(data);
      pending.current = null;
      setNotice(data.message ?? 'Saved.');
      return true;
    });
  return {
    setWorldController,
    guestSaveState,
    notice,
    setNotice,
    facilityAction,
    marketAction,
    profile,
    shift,
    mode,
    wallets,
    busy,
    error,
    initializing,
    setError,
    setMode,
    connect,
    logout,
    startPractice,
    start,
    resume,
    openJob,
    answer,
    hint,
    upgrade,
    rename,
  };
}
