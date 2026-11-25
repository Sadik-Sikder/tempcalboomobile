jest.mock('@notifee/react-native', () => ({}));
jest.mock('../src/api/auth', () => ({}));
jest.mock('../src/api/bookings', () => ({}));
jest.mock('../src/api/meetings', () => ({}));

import { planReminders } from '../src/background/meetingReminders';

const NOW = Date.UTC(2026, 10, 2, 9, 0); // 2 Nov 2026, 09:00 UTC

function meeting(overrides: object) {
  return {
    id: 1,
    title: 'Standup',
    status: 'active',
    active: 1,
    start_datetime: '2026-11-02 10:00:00',
    reminder: '2026-11-02 09:45:00',
    meeting_location: 'Zoom',
    ...overrides,
  };
}

describe('planReminders', () => {
  it('arms the reminder at the server-computed time', () => {
    expect(planReminders([meeting({})], [], NOW, 'UTC')).toEqual([
      {
        id: 'reminder-1',
        at: Date.UTC(2026, 10, 2, 9, 45),
        title: 'Standup',
        body: 'Starts in 15 minutes, at 10:00 AM · Zoom',
        screen: 'meetings',
      },
    ]);
  });

  it('shows the start in the given time zone', () => {
    const [r] = planReminders([meeting({})], [], NOW, 'Asia/Kolkata');
    expect(r.body).toBe('Starts in 15 minutes, at 3:30 PM · Zoom');
  });

  it.each([
    ['canceled', { status: 'canceled' }],
    ['switched off', { active: 0 }],
    ['without a reminder', { reminder: null }],
    ['whose reminder has passed', { reminder: '2026-11-02 08:59:00' }],
  ])('skips a meeting %s', (_, overrides) => {
    expect(planReminders([meeting(overrides)], [], NOW, 'UTC')).toEqual([]);
  });

  it('skips declined bookings and opens My Bookings for the rest', () => {
    const plan = planReminders(
      [],
      [
        meeting({ id: 2, guest_status: 'declined' }),
        meeting({ id: 3, guest_status: 'accepted' }),
      ],
      NOW,
      'UTC',
    );
    expect(plan.map(r => [r.id, r.screen])).toEqual([
      ['reminder-3', 'bookings'],
    ]);
  });

  it('sorts soonest first, keeps one per meeting, and words longer gaps', () => {
    const plan = planReminders(
      [
        meeting({
          id: 4,
          title: '  ',
          meeting_location: null,
          start_datetime: '2026-11-05 10:00:00',
          reminder: '2026-11-04 10:00:00',
        }),
        meeting({ id: 1 }),
      ],
      [meeting({ id: 1 })],
      NOW,
      'UTC',
    );
    expect(plan.map(r => [r.id, r.title, r.body])).toEqual([
      ['reminder-1', 'Standup', 'Starts in 15 minutes, at 10:00 AM · Zoom'],
      ['reminder-4', 'Meeting', 'Starts in 1 day, at 10:00 AM'],
    ]);
  });
});
