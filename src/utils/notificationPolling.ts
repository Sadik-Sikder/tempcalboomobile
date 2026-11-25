import { useSyncExternalStore } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { syncNotifications } from '../background/notificationSync';

const POLL_INTERVAL_MS = 100_000;

let unreadCount = 0;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach(listener => listener());
}

export function setUnreadCount(count: number) {
  const next = Math.max(0, count);
  if (next === unreadCount) return;
  unreadCount = next;
  emit();
}

export function decrementUnreadCount() {
  setUnreadCount(unreadCount - 1);
}

export function useUnreadCount(): number {
  return useSyncExternalStore(
    listener => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => unreadCount,
  );
}

async function poll() {
  try {
    // Same request the background job makes, minus the system
    // notifications — and it records what's been seen, so anything the
    // badge already showed won't be announced later from the background.
    setUnreadCount(await syncNotifications(false));
  } catch (err) {
    // A failed poll just leaves the last known count — the next tick (or
    // the next foregrounding) tries again.
    console.warn('Notification poll failed:', err);
  }
}

// Starts polling and returns a stop function. Called by App while the
// user is signed in; stopping also resets the badge so a different
// account signing in next doesn't briefly see the previous one's count.
export function startNotificationPolling(): () => void {
  let timer: ReturnType<typeof setInterval> | null = null;

  const start = () => {
    if (timer) return;
    poll();
    timer = setInterval(poll, POLL_INTERVAL_MS);
  };
  const stop = () => {
    if (timer) clearInterval(timer);
    timer = null;
  };

  const onChange = (state: AppStateStatus) => {
    if (state === 'active') start();
    else stop();
  };

  if (AppState.currentState === 'active') start();
  const sub = AppState.addEventListener('change', onChange);

  return () => {
    sub.remove();
    stop();
    setUnreadCount(0);
  };
}
