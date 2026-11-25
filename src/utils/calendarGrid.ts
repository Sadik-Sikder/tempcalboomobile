import dayjs from 'dayjs';
import { intlLocale } from '../i18n';

// Names and dates in the app's current language (see src/i18n). Functions,
// not constants, so they're read at render time, after a language change.
// Index like Date: Sunday is 0, January is 0.
export function weekdayLabels(): string[] {
  return [0, 1, 2, 3, 4, 5, 6].map(day => dayjs().day(day).format('ddd'));
}

export function monthShort(month: number): string {
  return dayjs().date(1).month(month).format('MMM');
}

// A date in the current language's own word order: { month: 'short',
// day: 'numeric' } is "Nov 12" in English and "12 nov." in French.
export function formatDate(
  d: Date,
  options: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat(intlLocale(), options).format(d);
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function isSameMonth(d: Date, monthDate: Date): boolean {
  return (
    d.getMonth() === monthDate.getMonth() &&
    d.getFullYear() === monthDate.getFullYear()
  );
}

// Web's month grid is always 6 weeks, Sunday-start — same here so the
// layout doesn't jump height between months.
export function buildMonthGrid(monthDate: Date): Date[] {
  const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return d;
  });
}
