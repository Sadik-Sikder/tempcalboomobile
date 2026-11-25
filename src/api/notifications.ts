import { authFetch, authFetchJson } from './http';

// Mirrors NotificationController — rows come back unread-first, then
// newest-first, cursor-paginated 15 at a time. `id` is a ULID string, not
// a number like the schedule ids elsewhere.
export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
}

export interface NotificationsResponse {
  notifications: {
    data: AppNotification[];
    next_cursor: string | null;
  };
  unread_count: number;
}

export function getNotifications(
  cursor: string | null = null,
): Promise<NotificationsResponse> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
  return authFetchJson(`/notifications${query}`);
}

export interface NotificationStatus {
  unread_count: number;
  // created_at of the newest notification (same format as in the list),
  // or null when the user has none.
  latest_at: string | null;
}

// Mirrors NotificationController::status() — the badge count and whether
// anything new arrived, without downloading a page of notifications.
// Resolves to null when the server predates the endpoint, so callers can
// fall back to the full list until the backend is deployed. That server
// answers 405 rather than 404: the path matches DELETE /notifications/{id}.
export async function getNotificationStatus(): Promise<NotificationStatus | null> {
  const response = await authFetch('/notifications/status');
  if (response.status === 404 || response.status === 405) return null;
  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }
  return response.json();
}

export function markNotificationRead(id: string): Promise<unknown> {
  return authFetchJson(`/notifications/${id}/read`, { method: 'PATCH' });
}

export function markAllNotificationsRead(): Promise<unknown> {
  return authFetchJson('/notifications/read-all', { method: 'PATCH' });
}
