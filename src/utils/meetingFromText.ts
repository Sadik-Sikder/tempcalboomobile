import dayjs, { type Dayjs } from 'dayjs';
import type { CompletionParams } from 'llama.rn';
import type { MeetingFormValues } from '../api/meetings';

// Turning "lunch with sam@x.com next Tuesday 1pm for 45 min on Zoom" into
// Create Meeting form values with a small on-device model (see
// ModelTestScreen).
//
// A 0.5B model is decent at picking facts out of a sentence and bad at
// arithmetic, so the work is split:
// - the model copies the day out as the user wrote it ("next Tuesday"),
//   and resolveDay() below turns that into a date — given a table of
//   upcoming dates instead, it picked the wrong row;
// - a JSON schema constrains the output while it's generated (llama.cpp
//   turns it into a grammar), so the reply parses and the duration and
//   location can only be values the form accepts;
// - toMeetingDraft() still checks every field, and drops what's empty.

// The Create Meeting form's own choices (EditMeetingScreen).
const DURATIONS = [15, 30, 45, 60, 120];
const LOCATIONS = ['Google Meet', 'Zoom'];

export interface ExtractedMeeting {
  title: string;
  day: string;
  start_time: string;
  duration_in_minutes: number;
  location: string;
  guests: string[];
}

const SYSTEM_PROMPT = `You fill in a meeting form from the user's message. Reply with JSON only.

Rules:
- title: a short title for the meeting.
- day: the day exactly as the user wrote it, e.g. "tomorrow", "next Friday", "12 Nov". "" if no day is mentioned.
- start_time: 24-hour HH:mm, e.g. 1pm is 13:00. "" if no time is mentioned.
- duration_in_minutes: one of ${DURATIONS.join(', ')}. 30 if not mentioned.
- location: "Google Meet", "Zoom", or "" if not mentioned.
- guests: email addresses from the message only. [] if none.`;

const SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    day: { type: 'string' },
    start_time: {
      type: 'string',
      pattern: '^(([01][0-9]|2[0-3]):[0-5][0-9])?$',
    },
    duration_in_minutes: { enum: DURATIONS },
    location: { enum: ['', ...LOCATIONS] },
    guests: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'title',
    'day',
    'start_time',
    'duration_in_minutes',
    'location',
    'guests',
  ],
};

export function buildMeetingExtraction(
  text: string,
): Pick<CompletionParams, 'messages' | 'response_format' | 'jinja'> {
  return {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: text },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { strict: true, schema: SCHEMA },
    },
    // Through the Jinja chat template, llama.rn let Qwen open its reply
    // with "<|im_start|>assistant" instead of the JSON. The plain template
    // hands the schema straight to the sampler.
    jinja: false,
  };
}

// Indexed like dayjs's day(): Sunday is 0.
const WEEKDAYS = [
  /\b(sun|sunday)\b/,
  /\b(mon|monday)\b/,
  /\b(tue|tues|tuesday)\b/,
  /\b(wed|weds|wednesday)\b/,
  /\b(thu|thur|thurs|thursday)\b/,
  /\b(fri|friday)\b/,
  /\b(sat|saturday)\b/,
];
const MONTHS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
];

// "today", "tomorrow", "day after tomorrow", "in 3 days", "in 2 weeks",
// "(this|next) friday" — the coming one, 1 to 7 days ahead — "12 Nov",
// "November 12th" or "2026-11-12", as YYYY-MM-DD; '' for anything else.
// A day and month without a year that's already gone means next year's.
export function resolveDay(phrase: string, today: Dayjs = dayjs()): string {
  const p = phrase.toLowerCase().trim();
  if (!p) return '';
  const start = today.startOf('day');
  const fmt = (d: Dayjs) => d.format('YYYY-MM-DD');

  const iso = p.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) {
    const d = dayjs(iso[0]);
    return d.isValid() ? fmt(d) : '';
  }
  if (/day after tomorrow/.test(p)) return fmt(start.add(2, 'day'));
  if (/\btomorrow\b/.test(p)) return fmt(start.add(1, 'day'));
  if (/\b(today|tonight)\b/.test(p)) return fmt(start);

  const inDays = p.match(/\bin (\d+|a|one|two|three) (day|week)s?\b/);
  if (inDays) {
    const words: Record<string, number> = { a: 1, one: 1, two: 2, three: 3 };
    const n = words[inDays[1]] ?? Number(inDays[1]);
    return fmt(start.add(inDays[2] === 'week' ? n * 7 : n, 'day'));
  }

  const parts = findDayAndMonth(p);
  if (parts) {
    let d = start.month(parts.month).date(parts.day);
    if (d.month() !== parts.month) return ''; // e.g. 31 Nov
    if (d.isBefore(start)) d = d.add(1, 'year');
    return fmt(d);
  }

  const weekday = WEEKDAYS.findIndex(pattern => pattern.test(p));
  if (weekday >= 0) {
    const ahead = (weekday - start.day() + 7) % 7 || 7;
    return fmt(start.add(ahead, 'day'));
  }
  return '';
}

// "12 Nov", "12th of November", "Nov 12", "November 12th". Every number
// next to a word is tried, since "45 minutes" comes first in plenty of
// sentences.
function findDayAndMonth(p: string): { day: number; month: number } | null {
  const month = (word: string) =>
    word.length === 3 || MONTH_NAMES.includes(word)
      ? MONTHS.indexOf(word.slice(0, 3))
      : -1;
  for (const m of p.matchAll(
    /\b(\d{1,2})(?:st|nd|rd|th)?(?: of)? ([a-z]+)\b/g,
  )) {
    if (month(m[2]) >= 0) return { day: Number(m[1]), month: month(m[2]) };
  }
  for (const m of p.matchAll(/\b([a-z]+) (\d{1,2})(?:st|nd|rd|th)?\b/g)) {
    if (month(m[1]) >= 0) return { day: Number(m[2]), month: month(m[1]) };
  }
  return null;
}

const MONTH_NAMES = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'sept',
  'october',
  'november',
  'december',
];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

// The fields worth pre-filling, from the model's reply. `text` is what the
// user typed: if the model's `day` doesn't resolve, the whole sentence is
// tried. Throws if the reply holds no JSON object (cut off by n_predict,
// say).
export function toMeetingDraft(
  reply: string,
  text: string,
): {
  extracted: ExtractedMeeting;
  draft: Partial<MeetingFormValues>;
} {
  const json = reply.slice(reply.indexOf('{'), reply.lastIndexOf('}') + 1);
  const extracted = JSON.parse(json) as ExtractedMeeting;
  const draft: Partial<MeetingFormValues> = {};

  const title = String(extracted.title ?? '').trim();
  if (title) draft.title = title;
  const date = resolveDay(String(extracted.day ?? '')) || resolveDay(text);
  if (date) draft.schedule_date = date;
  if (TIME.test(extracted.start_time ?? '')) {
    draft.start_time = extracted.start_time;
  }
  if (DURATIONS.includes(extracted.duration_in_minutes)) {
    draft.duration_in_minutes = extracted.duration_in_minutes;
  }
  if (LOCATIONS.includes(extracted.location)) {
    draft.meeting_location = extracted.location;
  }
  const guests = (Array.isArray(extracted.guests) ? extracted.guests : [])
    .map(g => String(g).trim().toLowerCase())
    .filter(g => EMAIL.test(g));
  if (guests.length) {
    draft.guests = [...new Set(guests)].map(email => ({ email }));
    // The form's "Group event" is for more than one guest.
    if (guests.length > 1) draft.type = 'group';
  }

  return { extracted, draft };
}
