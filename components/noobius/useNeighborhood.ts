'use client';
import { useEffect, useRef, useState } from 'react';
import type { Profile } from '@/lib/game';
import type { NeighborhoodSnapshot, RealmId } from '@/lib/neighborhoods';
import { retryDelay } from '@/lib/operations';
import { api, ClientError } from './useNoobius';

type Controller = { clientId: string; generation: number };
// Unique per document, including duplicated tabs. A reload explicitly offers
// Continue here while the old document's short lease is still held.
let documentClient = '';
export function useNeighborhood(
  profile: Profile | null,
  playing: boolean,
  readPosition: () => { x: number; z: number },
  onController: (value: Controller | null) => void,
) {
  const [snapshot, setSnapshot] = useState<NeighborhoodSnapshot | null>(null);
  const [status, setStatus] = useState('Connecting');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [needsTakeover, setNeedsTakeover] = useState(false);
  const [correction, setCorrection] = useState<{
    x: number;
    z: number;
    revision: number;
  } | null>(null);
  const current = useRef<NeighborhoodSnapshot | null>(null),
    actor = useRef(profile),
    point = useRef(readPosition());
  const positionReader = useRef(readPosition);
  positionReader.current = readPosition;
  actor.current = profile;
  const epoch = useRef(0),
    serial = useRef(0),
    revision = useRef(0),
    stopped = useRef(false);
  const failures = useRef(0),
    retryAt = useRef(0);
  const queue = useRef<Promise<unknown>>(Promise.resolve()),
    syncing = useRef(false),
    preferredRealm = useRef<RealmId>('commons');
  const clientId = () =>
    documentClient || (documentClient = crypto.randomUUID());
  const reset = () => {
    current.current = null;
    setSnapshot(null);
    onController(null);
  };
  const apply = (data: NeighborhoodSnapshot, resetPosition = false) => {
    const changed =
      current.current?.membership.generation !== data.membership.generation;
    current.current = data;
    setSnapshot(data);
    serial.current = data.membership.sequence;
    preferredRealm.current = data.membership.realm;
    onController({
      clientId: clientId(),
      generation: data.membership.generation,
    });
    stopped.current = false;
    failures.current = 0;
    retryAt.current = 0;
    setStatus('Connected');
    setError('');
    if (data.notice) setNotice(data.notice);
    setNeedsTakeover(false);
    if (changed || resetPosition || data.corrected) {
      point.current = { x: data.membership.x, z: data.membership.z };
      setCorrection({ ...point.current, revision: ++revision.current });
    }
  };
  const failure = (e: unknown) => {
    const message =
      e instanceof Error
        ? e.message
        : 'Could not connect to your neighborhood.';
    setError(message);
    if (e instanceof ClientError && e.status === 401) {
      stopped.current = true;
      onController(null);
      setStatus('Reconnect your wallet');
    } else if (message.includes('another tab')) {
      stopped.current = true;
      onController(null);
      setNeedsTakeover(true);
      setStatus('Open elsewhere');
    } else if (
      e instanceof ClientError &&
      e.status === 409 &&
      /expired|changed|resync/.test(message)
    ) {
      reset();
      preferredRealm.current = 'commons';
      setStatus('Reconnecting…');
    } else {
      if (!(e instanceof ClientError) || e.status === 429 || e.status >= 500)
        retryAt.current = Date.now() + retryDelay(++failures.current);
      setStatus(current.current ? 'Connection interrupted' : 'Reconnecting…');
    }
  };
  const enqueue = (operation: () => Promise<boolean>) => {
    const version = epoch.current;
    const result = queue.current.then(() =>
      version === epoch.current ? operation() : false,
    );
    queue.current = result.catch(() => false);
    return result;
  };
  const joinNow = async (realm: RealmId, takeover = false, target?: string) => {
    if (!actor.current || actor.current.wallet === 'practice') return false;
    const owner = actor.current,
      version = epoch.current;
    try {
      const first = !current.current;
      let data = await api<NeighborhoodSnapshot>('neighborhood-join', {
        expectedWallet: owner.wallet,
        clientId: clientId(),
        realm,
        takeover,
        target,
      });
      if (version !== epoch.current) return false;
      apply(data, true);
      if (first && data.membership.scene === 'commons' && owner.id) {
        data = await api<NeighborhoodSnapshot>('neighborhood-scene', {
          expectedWallet: owner.wallet,
          clientId: clientId(),
          generation: data.membership.generation,
          scene: 'home-' + owner.id,
        });
        if (version !== epoch.current) return false;
        apply(data, true);
      }
      return true;
    } catch (e) {
      if (version === epoch.current) failure(e);
      return false;
    }
  };
  const join = (
    realm: RealmId = preferredRealm.current,
    takeover = false,
    target?: string,
  ) => enqueue(() => joinNow(realm, takeover, target));
  const enter = (scene: string) =>
    enqueue(async () => {
      if (!actor.current || !current.current || stopped.current) return false;
      const owner = actor.current,
        version = epoch.current,
        before = current.current;
      try {
        const data = await api<NeighborhoodSnapshot>('neighborhood-scene', {
          expectedWallet: owner.wallet,
          clientId: clientId(),
          generation: before.membership.generation,
          scene,
        });
        if (version !== epoch.current) return false;
        apply(data, true);
        return true;
      } catch (e) {
        if (version === epoch.current) failure(e);
        return false;
      }
    });
  const syncNow = () =>
    enqueue(async () => {
      if (!actor.current || actor.current.wallet === 'practice') return true;
      if (stopped.current) return false;
      if (!current.current) return joinNow(preferredRealm.current);
      const version = epoch.current;
      try {
        const data = await api<NeighborhoodSnapshot>('neighborhood-sync', {
          expectedWallet: actor.current.wallet,
          clientId: clientId(),
          generation: current.current.membership.generation,
          sequence: ++serial.current,
          position: positionReader.current(),
        });
        if (epoch.current !== version) return false;
        apply(data);
        return !data.corrected;
      } catch (e) {
        if (version === epoch.current) failure(e);
        return false;
      }
    });
  useEffect(() => {
    epoch.current++;
    reset();
    stopped.current = false;
    preferredRealm.current = 'commons';
    setError('');
    setNotice('');
    setNeedsTakeover(false);
    setCorrection(null);
    failures.current = 0;
    retryAt.current = 0;
    if (!playing || !profile || profile.wallet === 'practice') {
      setStatus('Solo practice');
      return;
    }
    setStatus('Connecting');
    const refresh = async () => {
      if (
        syncing.current ||
        stopped.current ||
        document.hidden ||
        Date.now() < retryAt.current
      )
        return;
      syncing.current = true;
      try {
        await syncNow();
      } finally {
        syncing.current = false;
      }
    };
    void refresh();
    const timer = setInterval(refresh, 1500);
    const focus = () => void refresh();
    window.addEventListener('focus', focus);
    return () => {
      epoch.current++;
      clearInterval(timer);
      window.removeEventListener('focus', focus);
      onController(null);
    };
  }, [playing, profile?.wallet, onController]);
  return {
    dismissError: () => setError(''),
    snapshot,
    status,
    error,
    notice,
    dismissNotice: () => setNotice(''),
    needsTakeover,
    correction,
    join,
    enter,
    syncNow,
  };
}
