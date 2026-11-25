import { authFetch, authFetchJson } from './http';

export class TeamsBlockDeletionError extends Error {
  constructor(public teams: string[]) {
    super('Transfer ownership of your team(s) before deleting your account.');
  }
}

async function errorFrom(response: Response): Promise<Error> {
  const body = await response.json().catch(() => null);
  if (response.status === 409) {
    return new TeamsBlockDeletionError(body?.teams ?? []);
  }
  return new Error(
    body?.message ?? 'Failed to delete account. Please try again.',
  );
}

export async function checkAccountDeletable(): Promise<void> {
  const response = await authFetch('/account', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  if (response.status === 409) throw await errorFrom(response);
}

export async function sendDeleteAccountCode(): Promise<void> {
  const response = await authFetch('/account/delete/send-code', {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error(
      response.status === 429
        ? 'Too many requests. Wait a minute and try again.'
        : 'Failed to send verification code. Please try again.',
    );
  }
}

export async function deleteAccount(code: string): Promise<void> {
  const response = await authFetch('/account', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (!response.ok) throw await errorFrom(response);
}

export async function exportAccountData(): Promise<unknown> {
  const res = await authFetchJson<{ data: unknown }>('/account/export');
  return res.data;
}
