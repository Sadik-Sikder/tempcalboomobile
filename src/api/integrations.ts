import { authFetch, authFetchJson } from './http';

// Mirrors GoogleController.php — only Google Calendar is real OAuth; Google
// Meet and Zoom are plain authenticated toggles on the user's `integrations`
// JSON column (piggybacking on Calendar's token once it's connected), same
// as the web app's integrations.component.ts.

// `?platform=mobile` tells the backend's OAuth callback to hand control
// back via the calbookmobile:// deep link instead of the desktop popup's
// window.opener postMessage, which doesn't exist in a mobile browser.
export async function getGoogleCalendarAuthUrl(): Promise<string> {
  const res = await authFetchJson<{ url: string }>('/google/calendar/auth?platform=mobile');
  return res.url;
}

async function post(path: string): Promise<void> {
  const response = await authFetch(path, { method: 'POST' });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.message ?? body?.error ?? `Request failed (${response.status})`);
  }
}

// Also turns off Google Meet server-side (Meet piggybacks on Calendar's
// token), so callers should clear both flags locally after this resolves.
export const disconnectGoogleCalendar = () => post('/google/calendar/disconnect');

export const enableGoogleMeet = () => post('/google/meet/enable');
export const disableGoogleMeet = () => post('/google/meet/disconnect');

export const enableZoom = () => post('/google/zoom/enable');
export const disableZoom = () => post('/google/zoom/disconnect');
