import { API_URL } from '../constants/env';

// Mirrors TeamInviteController's public endpoints (and calbook's
// invite.service.ts). The token from the emailed link is the whole
// credential — no sign-in needed to view, accept or decline.

export interface TeamInvite {
  id: string;
  email: string;
  role: string;
  team: { id: string; name: string } | null;
  inviter: { id: string; name: string } | null;
}

async function request<T>(path: string, method: 'GET' | 'POST'): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: { Accept: 'application/json' },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    // 404 covers used, expired and unknown tokens alike.
    throw new Error(
      response.status === 404
        ? 'This invite is no longer valid. It may have expired or already been used.'
        : body?.message ?? 'Something went wrong',
    );
  }
  return body;
}

export async function getInvite(token: string): Promise<TeamInvite> {
  const res = await request<{ data: TeamInvite }>(
    `/team-invites/${encodeURIComponent(token)}`,
    'GET',
  );
  return res.data;
}

export async function acceptInvite(token: string): Promise<void> {
  await request(`/team-invites/${encodeURIComponent(token)}/accept`, 'POST');
}

export async function declineInvite(token: string): Promise<void> {
  await request(`/team-invites/${encodeURIComponent(token)}/decline`, 'POST');
}
