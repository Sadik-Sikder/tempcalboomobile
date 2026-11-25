import { useEffect, useState } from 'react';
import { authFetch, authFetchJson } from './http';
import { currentSession, onSessionReset } from '../utils/cachedState';

// Mirrors UserInfo::userinfo()/UserInfoUpdate::update() on the backend —
// same controller family as api/availability.ts's UserInfo::availability().

export interface UserInfo {
  name: string;
  email: string;
  user_role: string;
  provider: string | null;
  time_zone: string;
  country: string;
  language: string;
  profile_picture: string | null;
  integrations: {
    google_meet: boolean;
    google_calendar: boolean;
    zoom: boolean;
  };
  subscription: {
    plan_name: string;
    allowed_meeting_types: string[];
    max_events: number;
    max_tasks: number;
    expires_at: string | null;
    used_slots: number;
    remaining_slots: number;
    upcoming_subscription: {
      plan_name: string;
      starts_at: string;
      ends_at: string;
    } | null;
    extend: boolean;
  };
}

export async function getUserInfo(): Promise<UserInfo> {
  const res = await authFetchJson<{ data: UserInfo }>('/userinfo');
  return res.data;
}

// Every dashboard screen mounts its own ProfileMenu, so without a shared
// cache, switching tabs re-fetched /userinfo each time. Cached here at
// module scope (one fetch per session) and kept in sync across all
// mounted consumers via a tiny subscriber list.
let cachedUserInfo: UserInfo | null = null;
let inFlight: Promise<void> | null = null;
const listeners = new Set<(info: UserInfo | null) => void>();

function notify(info: UserInfo | null) {
  cachedUserInfo = info;
  listeners.forEach(listener => listener(info));
}

// Signing out empties the cache like every other session cache — and a
// /userinfo request still in flight for the old account is dropped when
// it lands (see cachedState.ts).
onSessionReset(() => {
  inFlight = null;
  notify(null);
});

function ensureFetched() {
  if (cachedUserInfo || inFlight) return;
  const requestSession = currentSession();
  inFlight = getUserInfo()
    .then(info => {
      if (requestSession === currentSession()) notify(info);
    })
    .catch(err => {
      console.error(err);
    })
    .finally(() => {
      inFlight = null;
    });
}

// Merges a partial update (e.g. ProfileEditScreen's save response) into
// the cache so every mounted ProfileMenu/edit screen reflects it without
// an extra round trip.
export function updateCachedUserInfo(patch: Partial<UserInfo>) {
  if (cachedUserInfo) notify({ ...cachedUserInfo, ...patch });
}

// The cache is fetched once per session, so screens showing data that can
// change elsewhere (the subscription, after a purchase on the web) call
// this on mount to pick up the latest. Every mounted consumer updates.
export async function refreshUserInfo(): Promise<void> {
  const requestSession = currentSession();
  const info = await getUserInfo();
  if (requestSession === currentSession()) notify(info);
}

// Synchronous read for non-component callers (e.g. a Linking deep-link
// handler) that need the current value without subscribing via the hook.
export function getCachedUserInfo(): UserInfo | null {
  return cachedUserInfo;
}

export function useUserInfo(): UserInfo | null {
  const [userInfo, setUserInfo] = useState<UserInfo | null>(cachedUserInfo);

  useEffect(() => {
    listeners.add(setUserInfo);
    setUserInfo(cachedUserInfo);
    ensureFetched();
    return () => {
      listeners.delete(setUserInfo);
    };
  }, []);

  return userInfo;
}

export interface ProfileUpdatePayload {
  name?: string;
  country?: string;
  language?: string;
  time_zone?: string;
}

// The response's `data` is a narrower shape than UserInfo (no
// profile_picture/subscription/integrations) — callers should merge this
// into existing state rather than replace it wholesale.
export async function updateProfile(
  payload: ProfileUpdatePayload,
): Promise<Partial<UserInfo>> {
  const response = await authFetch('/update', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.message ?? body?.error ?? 'Failed to update profile');
  }
  return body.data;
}

// Mirrors UserInfo::upload(): a separate endpoint from /update, saved as
// soon as it's sent (the web uploads on file select, not on Save). Same
// limits as the backend's validation: jpg/jpeg/png, max 2 MB.
export const PROFILE_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
export const PROFILE_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png'];

export async function uploadProfileImage(file: {
  uri: string;
  name: string;
  type: string;
}): Promise<string> {
  const payload = new FormData();
  // RN's FormData takes { uri, name, type } for a file part.
  payload.append('image', file as unknown as Blob);
  const response = await authFetch('/upload-profile-image', {
    method: 'POST',
    body: payload,
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.image_url) {
    throw new Error(body?.message ?? body?.error ?? 'Failed to upload photo');
  }
  // The new photo shows everywhere (every top bar's avatar) via the cache.
  updateCachedUserInfo({ profile_picture: body.image_url });
  return body.image_url;
}

export async function changePassword(
  oldPassword: string,
  newPassword: string,
): Promise<{ message: string }> {
  const response = await authFetch('/update-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      old_password: oldPassword,
      password: newPassword,
      password_confirmation: newPassword,
    }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      body?.message ?? body?.error ?? 'Failed to update password',
    );
  }
  return body;
}
