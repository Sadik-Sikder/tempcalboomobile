import {
  useCallback,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';

export interface ModuleCache<T> {
  get(): T;
  set(value: T): void;
}

// Module-level caches outlive the screens that fill them, and with them
// the signed-in account: without a reset, the next account to sign in on
// this device would briefly see the previous one's meetings, events, etc.
// Every cache registers here, and resetSessionCaches() — called from
// clearLocalSession() on logout, account deletion and expired sessions —
// empties them all.
//
// The session number guards against the other half of the problem: a
// request still in flight at sign-out resolving afterwards and writing the
// old account's data back into a freshly emptied cache. Code that writes
// a cache after an await checks currentSession() is unchanged first.
let session = 0;
const resetters = new Set<() => void>();

export function onSessionReset(reset: () => void) {
  resetters.add(reset);
}

export function resetSessionCaches() {
  session++;
  resetters.forEach(reset => reset());
}

export function currentSession(): number {
  return session;
}

export function createModuleCache<T>(initial: T): ModuleCache<T> {
  let value = initial;
  onSessionReset(() => {
    value = initial;
  });
  return {
    get: () => value,
    set: v => {
      value = v;
    },
  };
}

// Same call shape as useState, but every update is mirrored into the
// cache and the initial value is read from it — so screens can keep
// their existing `setX(prev => ...)` call sites unchanged.
//
// Updates are dropped once the session that mounted the screen has ended,
// so a response arriving after sign-out can't refill the cache.
export function useCachedState<T>(
  cache: ModuleCache<T>,
): [T, Dispatch<SetStateAction<T>>] {
  const [state, setStateInternal] = useState<T>(cache.get());
  const mountedSession = useRef(session);
  const setState = useCallback<Dispatch<SetStateAction<T>>>(
    update => {
      if (mountedSession.current !== session) return;
      setStateInternal(prev => {
        const next =
          typeof update === 'function' ? (update as (p: T) => T)(prev) : update;
        cache.set(next);
        return next;
      });
    },
    [cache],
  );
  return [state, setState];
}
