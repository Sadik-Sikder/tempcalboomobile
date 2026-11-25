import { authFetchJson } from './http';

// Mirrors AnalyticsController::index() and calbook's AnalyticsResponse
// model (src/app/models/analytics.model.ts).
export interface AnalyticsResponse {
  total_teams: number;
  total_events: number;
  hosted_meetings: number;
  upcoming_hosted: number;
  bookings: number;
  upcoming_bookings: number;
  total_meetings: number;
  completed_meetings: number;
  pending_meetings: number;
  cancelled_meetings: number;

  meetings_trend: { date: string; count: number }[];
  meeting_status: { status: string; count: number }[];
  // name is the event_type enum; null (or the string "null", which the web
  // has seen) for uncategorized events.
  event_types: { name: string | null; count: number; percentage: number }[];
  insights: {
    most_used_event_type: string | null;
    peak_booking_day: string | null;
    cancellation_rate: number;
  };
}

export type AnalyticsScope =
  | { type: 'personal' }
  | { type: 'team'; id: string };
export type AnalyticsPeriod = '7d' | '30d' | '90d' | '12m';

export const PERIOD_DAYS: Record<AnalyticsPeriod, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  '12m': 365,
};

export function getAnalytics(
  scope: AnalyticsScope,
  period: AnalyticsPeriod,
): Promise<AnalyticsResponse> {
  const params = new URLSearchParams({ scope_type: scope.type });
  if (scope.type === 'team') params.set('scope_id', scope.id);

  if (period === '12m') {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - PERIOD_DAYS[period]);
    params.set('start', start.toISOString());
    params.set('end', end.toISOString());
  } else {
    params.set('period', period);
  }

  return authFetchJson(`/analytics?${params.toString()}`);
}
