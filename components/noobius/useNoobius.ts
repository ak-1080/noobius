'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  applyFacility,
  newFacility,
  repairLoot,
  type FacilityAction,
} from '@/lib/facility';
import { signInWallet } from '@/lib/wallet';
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
export type Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (name: string, fn: (...args: any[]) => void) => void;
  removeListener?: (name: string, fn: (...args: any[]) => void) => void;
  isMetaMask?: boolean;
  isCoinbaseWallet?: boolean;
  providers?: Provider[];
};
export type WalletOption = { id: string; name: string; provider: Provider };
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
  const [notice, setNotice] = useState('');
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
    api('profile')
      .then((data) => {
        if (alive && data.profile) apply(data);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setInitializing(false);
      });
    const found = new Map<string, WalletOption>();
    const add = (id: string, name: string, provider: Provider) => {
      if (typeof provider?.request === 'function' && !found.has(id)) {
        found.set(id, { id, name, provider });
        setWallets([...found.values()]);
      }
    };
    const announce = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (
        detail &&
        typeof detail.info?.uuid === 'string' &&
        typeof detail.info?.name === 'string'
      )
        add(detail.info.uuid, detail.info.name.slice(0, 40), detail.provider);
    };
    window.addEventListener('eip6963:announceProvider', announce);
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    const fallback = setTimeout(() => {
      const p = window.ethereum;
      if (p) {
        for (const provider of p.providers ?? [p])
          if (![...found.values()].some((x) => x.provider === provider))
            add(
              'injected' + found.size,
              provider.isMetaMask
                ? 'MetaMask'
                : provider.isCoinbaseWallet
                  ? 'Coinbase Wallet'
                  : 'Browser wallet',
              provider,
            );
      }
    }, 300);
    return () => {
      alive = false;
      clearTimeout(fallback);
      window.removeEventListener('eip6963:announceProvider', announce);
      listeners.current?.();
    };
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
    const p =
      state.current.profile?.wallet === 'practice'
        ? state.current.profile
        : guestProfile();
    setProfile(p);
    setShift(newShift(p.equipment));
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
                credits: p.credits + next.shift.credits - s.credits,
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
      const key = JSON.stringify(['facility', action]);
      if (pending.current?.key !== key)
        pending.current = { key, id: crypto.randomUUID() };
      const a = { ...action, requestId: pending.current.id } as FacilityAction;
      if (p.wallet === 'practice') {
        const next = applyFacility(p.facility ?? newFacility(), a, p.credits);
        setProfile({
          ...p,
          facility: next.facility,
          credits: p.credits + next.credits,
          xp: p.xp + next.xp,
        });
        setNotice(next.message);
      } else {
        const data = await api('facility', {
          action: a,
          expectedWallet: p.wallet,
        });
        apply(data);
        setNotice(data.message ?? 'Saved.');
      }
      pending.current = null;
      return true;
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
        ...body,
        requestId: pending.current.id,
        expectedWallet: state.current.profile?.wallet,
      });
      apply(data);
      pending.current = null;
      setNotice('Trade recorded.');
      return true;
    });
  return {
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
