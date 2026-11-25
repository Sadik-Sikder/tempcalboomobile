import { authFetch, authFetchJson } from './http';

// Mirrors calbook/src/app/dashboard/team/team.service.ts + TeamController/
// TeamInviteController on the backend. Only the endpoints that are
// actually wired server-side are included here — the web UI also renders
// a "Remove member" button and a per-member role <select>, but neither
// has a (click)/(change) handler in team.component.html and neither has a
// matching backend route, so they're dead UI on web and deliberately not
// ported here.

export type TeamRole = 'owner' | 'admin' | 'member';

export interface Team {
  id: string;
  name: string;
  owner?: { id: string; name: string; email?: string };
  role?: TeamRole;
  is_owner?: boolean;
  is_admin?: boolean;
  is_member?: boolean;
  members_count?: number;
  updated_at?: string;
}

export interface TeamMember {
  id: string;
  name: string;
  email?: string;
  role?: TeamRole;
}

export interface TeamDetail extends Team {
  my_role?: TeamRole;
  members: TeamMember[];
  created_at?: string;
}

export async function getTeams(): Promise<Team[]> {
  const res = await authFetchJson<{ data: Team[] }>('/teams?page=1&per_page=50');
  return res.data;
}

export async function getTeamMembers(teamId: string): Promise<TeamDetail> {
  const res = await authFetchJson<{ data: TeamDetail }>(`/teams/${teamId}`);
  return res.data;
}

async function teamJson<T>(path: string, init: RequestInit): Promise<T> {
  const response = await authFetch(path, {
    ...init,
    headers: { ...(init.headers ?? {}), 'Content-Type': 'application/json' },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.message ?? body?.error ?? 'Request failed');
  }
  return body;
}

export async function createTeam(name: string): Promise<Team> {
  const res = await teamJson<{ data: Team }>('/teams', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
  return res.data;
}

export async function updateTeam(teamId: string, name: string): Promise<Team> {
  const res = await teamJson<{ data: Team }>(`/teams/${teamId}`, {
    method: 'PUT',
    body: JSON.stringify({ name }),
  });
  return res.data;
}

// Soft-delete server-side (schema has a 30-day permanent_delete_at grace
// window) — the API still just calls it "deleted" from the client's POV.
export function deleteTeam(teamId: string): Promise<{ message: string }> {
  return teamJson(`/teams/${teamId}`, { method: 'DELETE' });
}

export function leaveTeam(teamId: string): Promise<{ message: string }> {
  return teamJson(`/teams/${teamId}/leave`, { method: 'POST' });
}

export function transferOwnership(
  teamId: string,
  newOwnerId: string,
): Promise<{ message: string }> {
  return teamJson(`/teams/${teamId}/transfer-ownership`, {
    method: 'PATCH',
    body: JSON.stringify({ new_owner_id: newOwnerId }),
  });
}

// role defaults to 'member' server-side if omitted; only a team's owner
// (not an admin) may invite with role 'admin' — ScheduleService-adjacent
// rule, enforced server-side (403 "Only owner can assign admin role").
export function inviteMember(
  teamId: string,
  email: string,
  role: 'admin' | 'member' = 'member',
): Promise<{ message: string }> {
  return teamJson(`/teams/${teamId}/invites`, {
    method: 'POST',
    body: JSON.stringify({ email, role }),
  });
}
