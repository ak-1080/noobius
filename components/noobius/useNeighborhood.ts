'use client';
import { useEffect, useRef, useState } from 'react';
import type { Profile } from '@/lib/game';
import type {
  Membership,
  NeighborhoodSnapshot,
  RealmId,
} from '@/lib/neighborhoods';
import { retryDelay } from '@/lib/operations';
import { RoomClient } from '@/lib/room-client';
import type { PrepareRoomWork } from '@/lib/room-protocol';
import { api, ClientError } from './useNoobius';

type Controller = { clientId: string; generation: number };
let documentClient = '';
const samePlace = (a: Membership, b: Membership) =>
  a.generation === b.generation &&
  a.neighborhoodId === b.neighborhoodId &&
  a.scene === b.scene;
export function useNeighborhood(
  profile: Profile | null,
  playing: boolean,
  readPosition: () => { x: number; z: number },
  onController: (value: Controller | null) => void,
  onRoomWork: (value: PrepareRoomWork | null) => void,
) {
  const [snapshot, setSnapshot] = useState<NeighborhoodSnapshot | null>(null);
  const [status, setStatus] = useState('Connecting');
  const [canMove, setCanMove] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [needsTakeover, setNeedsTakeover] = useState(false);
  const [correction, setCorrection] = useState<{
    x: number;
    z: number;
    revision: number;
  } | null>(null);
  const current = useRef<NeighborhoodSnapshot | null>(null),
    actor = useRef(profile);
  const positionReader = useRef(readPosition);
  positionReader.current = readPosition;
  actor.current = profile;
  const epoch = useRef(0),
    serial = useRef(0),
    revision = useRef(0),
    stopped = useRef(false);
  const failures = useRef(0),
    retryAt = useRef(0),
    metadataAt = useRef(0);
  const queue = useRef<Promise<unknown>>(Promise.resolve()),
    syncing = useRef(false),
    preferredRealm = useRef<RealmId>('commons');
  const socket = useRef<RoomClient | null>(null),
    peers = useRef<NeighborhoodSnapshot['people']>([]);
  const clientId = () =>
    documentClient || (documentClient = crypto.randomUUID());
  const correct = (point: { x: number; z: number }) =>
    setCorrection({ ...point, revision: ++revision.current });
  const publish = () => {
    const data = current.current;
    if (!data) {
      setSnapshot(null);
      return;
    }
    const people = new Map(data.people.map((p) => [p.id, p]));
    for (const p of peers.current) people.set(p.id, p);
    setSnapshot({ ...data, people: [...people.values()] });
  };
  const closeSocket = () => {
    const old = socket.current;
    socket.current = null;
    peers.current = [];
    old?.dispose();
    setCanMove(false);
  };
  const reset = () => {
    closeSocket();
    current.current = null;
    setSnapshot(null);
    onController(null);
  };
  const apply = (data: NeighborhoodSnapshot, resetPosition = false) => {
    const before = current.current;
    const changed = !before || !samePlace(before.membership, data.membership);
    if (changed) closeSocket();
    // Metadata can arrive after a newer socket checkpoint. Never wind the
    // durable sequence backwards or snap a walking actor to an older save.
    if (!changed && data.membership.sequence < before.membership.sequence)
      data = { ...data, membership: before.membership };
    current.current = data;
    serial.current = data.membership.sequence;
    preferredRealm.current = data.membership.realm;
    onController({
      clientId: clientId(),
      generation: data.membership.generation,
    });
    stopped.current = false;
    const ready =
      data.roomTransport === 'socket'
        ? !!socket.current?.ready
        : !data.writerActive;
    if (ready) {
      failures.current = 0;
      retryAt.current = 0;
      setError('');
    }
    setCanMove(ready);
    setStatus(ready ? 'Connected' : 'Connecting…');
    if (data.notice) setNotice(data.notice);
    setNeedsTakeover(false);
    if (changed || resetPosition || data.corrected) correct(data.membership);
    publish();
  };
  const failure = (e: unknown) => {
    const message =
      e instanceof Error
        ? e.message
        : 'Could not connect to your neighborhood.';
    setError(message);
    setCanMove(false);
    if (e instanceof ClientError && e.status === 401) {
      stopped.current = true;
      closeSocket();
      onController(null);
      setStatus('Reconnect your wallet');
    } else if (message.includes('another tab')) {
      stopped.current = true;
      closeSocket();
      onController(null);
      setNeedsTakeover(true);
      setStatus('Open elsewhere');
    } else if (
      e instanceof ClientError &&
      e.status === 409 &&
      /expired|changed|resync/.test(message) &&
      !message.includes('owns movement')
    ) {
      reset();
      setStatus('Reconnecting…');
    } else {
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
  const controllerBody = () => ({
    expectedWallet: actor.current!.wallet,
    clientId: clientId(),
    generation: current.current!.membership.generation,
  });
  const connectRoom = async () => {
    if (
      !current.current ||
      current.current.roomTransport !== 'socket' ||
      stopped.current
    )
      return false;
    if (socket.current) return socket.current.ready;
    const version = epoch.current,
      expected = current.current.membership;
    try {
      setCanMove(false);
      setStatus('Connecting…');
      const ticket = await api<{ ticket: string; coordinatorOrigin: string }>(
        'room-ticket',
        controllerBody(),
      );
      if (
        version !== epoch.current ||
        !current.current ||
        !samePlace(expected, current.current.membership)
      )
        return false;
      const room = new RoomClient({
        ...ticket,
        membership: expected,
        readPosition: () => positionReader.current(),
        onMembership: (membership, resetPosition) => {
          if (
            version !== epoch.current ||
            socket.current !== room ||
            !current.current
          )
            return;
          current.current = { ...current.current, membership };
          serial.current = membership.sequence;
          if (resetPosition) correct(membership);
          publish();
        },
        onPeople: (people) => {
          if (version === epoch.current && socket.current === room) {
            peers.current = people;
            publish();
          }
        },
        onCorrection: (point) => {
          if (version === epoch.current && socket.current === room)
            correct(point);
        },
        onReady: (ready) => {
          if (version !== epoch.current || socket.current !== room) return;
          setCanMove(ready);
          setStatus(ready ? 'Connected' : 'Syncing…');
        },
        onDisconnect: () => {
          if (version !== epoch.current || socket.current !== room) return;
          socket.current = null;
          peers.current = [];
          publish();
          setCanMove(false);
          setStatus('Reconnecting…');
          retryAt.current = Date.now() + retryDelay(++failures.current);
        },
      });
      socket.current = room;
      await room.connect();
      if (version !== epoch.current || socket.current !== room) {
        room.dispose();
        return false;
      }
      failures.current = 0;
      retryAt.current = 0;
      setError('');
      return true;
    } catch (e) {
      if (version === epoch.current) {
        closeSocket();
        failure(e);
      }
      return false;
    }
  };
  const readState = async (resetPosition = false) => {
    if (!current.current || !actor.current) return false;
    const version = epoch.current;
    const data = await api<NeighborhoodSnapshot>(
      'neighborhood-state',
      controllerBody(),
    );
    if (version !== epoch.current) return false;
    metadataAt.current = Date.now();
    apply(data, resetPosition);
    return true;
  };
  const releaseRoom = async () => {
    const version = epoch.current;
    const room = socket.current;
    setCanMove(false);
    if (!room)
      return (
        current.current?.roomTransport !== 'socket' &&
        !current.current?.writerActive
      );
    // Keep callbacks installed through the final save; then dispose before any
    // HTTP scene change so late frames cannot restore the old room.
    try {
      await room.release();
    } catch (e) {
      if (version === epoch.current) {
        closeSocket();
        failure(e);
      }
      return false;
    }
    if (version !== epoch.current) return false;
    closeSocket();
    try {
      return await readState(true);
    } catch (e) {
      if (version === epoch.current) failure(e);
      return false;
    }
  };
  const joinNow = async (realm: RealmId, takeover = false, target?: string) => {
    if (!actor.current || actor.current.wallet === 'practice') return false;
    const owner = actor.current,
      version = epoch.current;
    try {
      if (socket.current && !(await releaseRoom())) return false;
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
      if (data.roomTransport === 'socket') return connectRoom();
      return !data.writerActive;
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
      const version = epoch.current;
      try {
        if (socket.current && !(await releaseRoom())) return false;
        const data = await api<NeighborhoodSnapshot>('neighborhood-scene', {
          ...controllerBody(),
          scene,
        });
        if (version !== epoch.current) return false;
        apply(data, true);
        return data.roomTransport === 'socket'
          ? connectRoom()
          : !data.writerActive;
      } catch (e) {
        if (version === epoch.current) failure(e);
        return false;
      }
    });
  const syncNow = () =>
    enqueue(async () => {
      if (!actor.current || actor.current.wallet === 'practice') return true;
      if (stopped.current) return false;
      // Joining/recovery is not proof that the old requested worksite was reached.
      if (!current.current) {
        await joinNow(preferredRealm.current);
        return false;
      }
      const version = epoch.current;
      try {
        if (current.current.roomTransport === 'socket') {
          if (!socket.current?.ready) return false;
          const synced = await socket.current.syncPosition();
          return epoch.current === version && synced;
        }
        if (current.current.writerActive) {
          await readState(true);
          return false;
        }
        const data = await api<NeighborhoodSnapshot>('neighborhood-sync', {
          ...controllerBody(),
          sequence: ++serial.current,
          position: positionReader.current(),
        });
        if (epoch.current !== version) return false;
        apply(data);
        return !data.corrected && data.roomTransport !== 'socket';
      } catch (e) {
        if (version === epoch.current) failure(e);
        return false;
      }
    });
  const travel = <T>(operation: () => Promise<T>): Promise<T | undefined> => {
    const version = epoch.current;
    const result = queue.current.then(async () => {
      if (version !== epoch.current || !(await releaseRoom())) return undefined;
      try {
        return await operation();
      } finally {
        if (version === epoch.current) await joinNow(preferredRealm.current);
      }
    });
    queue.current = result.catch(() => false);
    return result;
  };
  const prepareWork: PrepareRoomWork = async (action, body) => {
    if (!(await syncNow()))
      throw new ClientError(
        'Your position is syncing. Try again once you arrive.',
      );
    if (
      !actor.current ||
      !current.current ||
      body.expectedWallet !== actor.current.wallet ||
      body.clientId !== clientId() ||
      body.generation !== current.current.membership.generation
    )
      throw new ClientError('Your room changed. Try that action again.');
    if (current.current.roomTransport === 'socket') {
      if (!socket.current)
        throw new ClientError('Your room is reconnecting. Try again shortly.');
      return socket.current.prepare(action, body);
    }
    return { complete: async () => {} };
  };
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
    metadataAt.current = 0;
    onRoomWork(prepareWork);
    if (!playing || !profile || profile.wallet === 'practice') {
      setStatus('Solo practice');
      return () => {
        epoch.current++;
        closeSocket();
        onController(null);
        onRoomWork(null);
      };
    }
    setStatus('Connecting');
    const effectEpoch = epoch.current;
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
        await enqueue(async () => {
          if (!current.current) return joinNow(preferredRealm.current);
          if (current.current.roomTransport === 'socket') {
            if (!socket.current || Date.now() - metadataAt.current >= 5000)
              await readState(!socket.current);
            if (current.current?.roomTransport === 'socket')
              return socket.current ? true : connectRoom();
            // A server-side switch can disable transport. Release or wait for
            // its persisted writer lease before resuming HTTP movement.
            if (socket.current) await releaseRoom();
            return false;
          }
          return true;
        });
        if (current.current?.roomTransport !== 'socket') await syncNow();
      } catch (e) {
        if (epoch.current === effectEpoch) failure(e);
      } finally {
        syncing.current = false;
      }
    };
    void refresh();
    const timer = setInterval(refresh, 1500),
      focus = () => void refresh();
    window.addEventListener('focus', focus);
    return () => {
      epoch.current++;
      clearInterval(timer);
      window.removeEventListener('focus', focus);
      closeSocket();
      onController(null);
      onRoomWork(null);
    };
  }, [playing, profile?.wallet, onController, onRoomWork]);
  return {
    dismissError: () => setError(''),
    snapshot,
    status,
    canMove,
    error,
    notice,
    dismissNotice: () => setNotice(''),
    needsTakeover,
    correction,
    join,
    enter,
    syncNow,
    travel,
  };
}
