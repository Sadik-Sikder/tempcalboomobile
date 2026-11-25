import { authFetchJson } from './http';

// Mirrors ScheduleController::calendar() — a single lean endpoint covering
// BOTH owned schedules (Meetings) and guest schedules (Bookings) in one
// unified range query, unlike those two screens' separate owner/guest
// endpoints. Deliberately narrow field set (no meeting_location,
// description, guests, status, etc.) — the backend strips those for a
// lighter grid payload, so this type only has what it actually returns.
export interface CalendarItem {
  id: number;
  title: string | null;
  type: string;
  start_datetime: string;
  end_datetime: string;
  time_zone: string;
  active: number;
  is_guest: boolean;
  guest_status: string | null;
  can_manage: boolean;
  user: { name: string; email: string; profile_image?: string | null };
}

// start/end are 'YYYY-MM-DD' — the response is a raw array, not wrapped in
// { data: [...] } like the paginated endpoints.
export function getCalendarSchedules(
  startDate: string,
  endDate: string,
): Promise<CalendarItem[]> {
  return authFetchJson(
    `/schedules/calendar?start_date=${startDate}&end_date=${endDate}`,
  );
}
