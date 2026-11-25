import dayjs from 'dayjs';
import { resolveDay, toMeetingDraft } from '../src/utils/meetingFromText';

// A Wednesday.
const TODAY = dayjs('2026-10-28T09:00:00');

describe('resolveDay', () => {
  it.each([
    ['', ''],
    ['today', '2026-10-28'],
    ['tomorrow', '2026-10-29'],
    ['day after tomorrow', '2026-10-30'],
    ['in 3 days', '2026-10-31'],
    ['in a week', '2026-11-04'],
    ['next Tuesday', '2026-11-03'],
    ['tuesday', '2026-11-03'],
    ['Fri', '2026-10-30'],
    // The same weekday as today means a week out.
    ['next wednesday', '2026-11-04'],
    ['12 Nov', '2026-11-12'],
    ['November 12th', '2026-11-12'],
    ['the 3rd of december', '2026-12-03'],
    // Already gone this year.
    ['5 Jan', '2027-01-05'],
    ['2026-12-24', '2026-12-24'],
    ['31 Nov', ''],
    ['soon', ''],
    // Words that only start like a weekday.
    ['the wedding', ''],
  ])('%j → %j', (phrase, expected) => {
    expect(resolveDay(phrase, TODAY)).toBe(expected);
  });

  it('skips numbers that are not dates', () => {
    expect(resolveDay('45 minutes on 12 nov', TODAY)).toBe('2026-11-12');
  });
});

describe('toMeetingDraft', () => {
  it('keeps valid fields and ignores text around the JSON', () => {
    const reply = `<|im_start|>assistant
{"title": "Lunch with Sam", "day": "", "start_time": "13:00",
 "duration_in_minutes": 45, "location": "Zoom",
 "guests": ["Sam@Example.com", "not an email", "ann@example.com"]}`;
    const { draft } = toMeetingDraft(reply, 'lunch tomorrow');
    expect(draft).toEqual({
      title: 'Lunch with Sam',
      // `day` was empty, so it came from the typed text.
      schedule_date: dayjs().add(1, 'day').format('YYYY-MM-DD'),
      start_time: '13:00',
      duration_in_minutes: 45,
      meeting_location: 'Zoom',
      guests: [{ email: 'sam@example.com' }, { email: 'ann@example.com' }],
      type: 'group',
    });
  });

  it('drops values the form does not offer', () => {
    const { draft } = toMeetingDraft(
      '{"title": "", "day": "", "start_time": "25:00", "duration_in_minutes": 90, "location": "Teams", "guests": []}',
      '',
    );
    expect(draft).toEqual({});
  });

  it('throws when there is no JSON', () => {
    expect(() => toMeetingDraft('{"title": "Lun', '')).toThrow();
  });
});
