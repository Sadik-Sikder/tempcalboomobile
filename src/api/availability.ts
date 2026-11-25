import { authFetch, authFetchJson } from './http';

// Mirrors calbook/src/app/dashboard/availability/availability.service.ts
// and the backend's UserInfo::availability() — a single global weekly
// schedule per user (user_id is the table's primary key), not multiple
// named schedules and no date-specific overrides.

export const DAY_KEYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
export type DayKey = (typeof DAY_KEYS)[number];

export interface DaySlot {
  active: boolean;
  start: string | null; // 12-hour display string, e.g. "09:00 AM" — the
  end: string | null;   // backend stores/parses these verbatim (Carbon::parse)
}

export type AvailabilityMap = Record<DayKey, DaySlot>;

// GET's response is the day-map directly at the JSON root (not wrapped),
// unlike POST's `{ availability: {...} }` — kept as two separate calls
// rather than one shared parser so that asymmetry stays explicit here
// instead of being a subtle shared-code bug later.
export function getAvailability(): Promise<AvailabilityMap> {
  return authFetchJson('/availability');
}

export async function updateAvailability(
  map: AvailabilityMap,
): Promise<AvailabilityMap> {
  const response = await authFetch('/availability', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // The backend validates `availability` as `required|json` — a JSON
    // *string*, not a nested object — so the day-map is stringified before
    // being placed in the outer request body, matching the web app's
    // double-encoding exactly.
    body: JSON.stringify({ availability: JSON.stringify(map) }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.message ?? body?.error ?? 'Failed to save availability');
  }
  return body.availability;
}
