import dayjs, { type Dayjs } from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { intlLocale } from '../i18n';

dayjs.extend(utc);

export function parseApiDateUtc(value: string): Dayjs {
  return dayjs.utc(value);
}

export function toDisplayDate(value: string, zone: string): string {
  const instant = parseApiDateUtc(value).toDate();
  // In the app's language ("Nov 12, 2026" / "12 nov. 2026").
  return new Intl.DateTimeFormat(intlLocale(), {
    timeZone: zone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(instant);
}

interface DisplayTimeOptions {
  // Zero-pad the hour ("06:23 PM" vs "6:23 PM") — matches dayjs's 'hh' vs 'h'.
  padHour?: boolean;
  // Strip the space and lowercase the AM/PM ("6:23pm") — matches dayjs's
  // 'h:mmA' + .toLowerCase() convention used in a couple of places.
  compact?: boolean;
}

export function toDisplayTime(
  value: string,
  zone: string,
  { padHour = false, compact = false }: DisplayTimeOptions = {},
): string {
  const instant = parseApiDateUtc(value).toDate();
  const locale = intlLocale();
  // Other languages get their own clock: "18:23" in French and German.
  // The options below shape English's "6:23 PM" only.
  if (locale !== 'en') {
    return new Intl.DateTimeFormat(locale, {
      timeZone: zone,
      hour: '2-digit',
      minute: '2-digit',
    }).format(instant);
  }
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hour: padHour ? '2-digit' : 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(instant);

  return compact ? formatted.replace(' ', '').toLowerCase() : formatted;
}

export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  zone: string,
): Date {
  const asIfUtc = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
    .formatToParts(asIfUtc)
    .reduce((acc: Record<string, string>, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});

  const wallClockAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );

  const offsetMs = wallClockAsUtc - asIfUtc.getTime();
  return new Date(asIfUtc.getTime() - offsetMs);
}

// The forward direction of zonedTimeToUtc: given a UTC api datetime string,
// get its wall-clock date/time parts as they read in a specific IANA zone.
// Needed to pre-fill the meeting form's separate date/time fields from an
// existing schedule's start_datetime (stored in UTC).
export function toZonedParts(
  value: string,
  zone: string,
): { date: string; time: string } {
  const instant = parseApiDateUtc(value).toDate();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
    .formatToParts(instant)
    .reduce((acc: Record<string, string>, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}`,
  };
}

// buildMeetingPayload's exact start_datetime/end_datetime string format.
export function formatUtcForApi(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(
      date.getUTCDate(),
    )} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(
      date.getUTCSeconds(),
    )}`
  );
}
