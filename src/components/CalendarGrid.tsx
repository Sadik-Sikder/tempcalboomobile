import { Pressable, Text, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import dayjs from 'dayjs';
import { gradients } from '../constants/colors';
import { makeStyles } from '../theme/ThemeContext';
import { useTranslation } from 'react-i18next';
import { formatDate, weekdayLabels } from '../utils/calendarGrid';

interface CalendarDay {
  date: Date;
  isCurrentMonth: boolean;
  isAvailable: boolean;
  isToday: boolean;
  isPast: boolean;
}

interface Props {
  monthDate: Date;
  selectedDate: Date | null;
  monthAvailability: Record<string, boolean>;
  onChangeMonth: (offset: number) => void;
  onSelectDate: (date: Date) => void;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// The web version's week-count loop had a comparison bug that made it
// stop after a single week in practice (comparing a plain object to a
// Date with `>`). This always renders however many full weeks the month
// actually needs (5 or 6), which is what a calendar grid should do.
function buildWeeks(
  monthDate: Date,
  monthAvailability: Record<string, boolean>,
): CalendarDay[][] {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startingWeekday = firstDay.getDay();
  const totalCells = Math.ceil((startingWeekday + lastDay.getDate()) / 7) * 7;

  const today = new Date();
  const weeks: CalendarDay[][] = [];
  let week: CalendarDay[] = [];

  for (let i = 0; i < totalCells; i++) {
    const date = new Date(year, month, 1 - startingWeekday + i);
    const dateKey = dayjs(date).format('YYYY-MM-DD');

    week.push({
      date,
      isCurrentMonth: date.getMonth() === month,
      isAvailable: monthAvailability?.[dateKey] ?? false,
      isToday: isSameDay(date, today),
      isPast:
        new Date(date.getFullYear(), date.getMonth(), date.getDate()) <
        new Date(today.getFullYear(), today.getMonth(), today.getDate()),
    });

    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }

  return weeks;
}

export function CalendarGrid({
  monthDate,
  selectedDate,
  monthAvailability,
  onChangeMonth,
  onSelectDate,
}: Props) {
  const styles = useStyles();
  // Re-renders with new month and weekday names when the language changes.
  useTranslation();
  const weeks = buildWeeks(monthDate, monthAvailability);
  const monthYear = formatDate(monthDate, { month: 'long', year: 'numeric' });

  return (
    <View>
      <View style={styles.header}>
        <Pressable
          style={styles.navButton}
          onPress={() => onChangeMonth(-1)}
          hitSlop={8}
        >
          <Text style={styles.navButtonText}>{'‹'}</Text>
        </Pressable>
        <Text style={styles.monthLabel}>{monthYear}</Text>
        <Pressable
          style={styles.navButton}
          onPress={() => onChangeMonth(1)}
          hitSlop={8}
        >
          <Text style={styles.navButtonText}>{'›'}</Text>
        </Pressable>
      </View>

      <View style={styles.weekRow}>
        {weekdayLabels().map(label => (
          <Text key={label} style={styles.dayLabel}>
            {label}
          </Text>
        ))}
      </View>

      {weeks.map((week, weekIndex) => (
        <View key={weekIndex} style={styles.weekRow}>
          {week.map(day => {
            const selected = selectedDate
              ? isSameDay(day.date, selectedDate)
              : false;
            const disabled =
              !day.isCurrentMonth || day.isPast || !day.isAvailable;

            const cellContent = (
              <Text
                style={[
                  styles.dayText,
                  day.isToday && !selected && styles.dayTextToday,
                  disabled && styles.dayTextDisabled,
                  selected && styles.dayTextSelected,
                  day.isAvailable && !selected && styles.dayTextAvailable,
                ]}
              >
                {day.date.getDate()}
              </Text>
            );

            return (
              <Pressable
                key={day.date.toISOString()}
                disabled={disabled}
                onPress={() => onSelectDate(day.date)}
                style={styles.dayCell}
              >
                {selected ? (
                  <LinearGradient
                    colors={gradients.primary}
                    style={styles.dayCellFill}
                  >
                    {cellContent}
                  </LinearGradient>
                ) : (
                  <View
                    style={[
                      styles.dayCellFill,
                      day.isAvailable && styles.dayCellAvailable,
                      day.isToday && styles.dayCellToday,
                    ]}
                  >
                    {cellContent}
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const CELL_SIZE = 38;

const useStyles = makeStyles(c => ({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 12,
  },
  navButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.borderSoft,
    borderWidth: 1,
    borderColor: c.border,
  },
  navButtonText: {
    color: c.primaryText,
    fontSize: 16,
    fontWeight: '700',
    marginTop: -2,
  },
  monthLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: c.text,
    minWidth: 150,
    textAlign: 'center',
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dayLabel: {
    width: CELL_SIZE,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    color: c.textMuted,
    paddingVertical: 6,
    textTransform: 'uppercase',
  },
  dayCell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    marginVertical: 3,
  },
  dayCellFill: {
    flex: 1,
    borderRadius: CELL_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCellAvailable: {
    backgroundColor: c.surfaceTintStrong,
  },
  dayCellToday: {
    borderWidth: 1.5,
    borderColor: c.primary,
  },
  dayText: {
    fontSize: 13,
    fontWeight: '500',
    color: c.text,
  },
  dayTextAvailable: {
    color: c.primaryText,
    fontWeight: '600',
  },
  dayTextToday: {
    color: c.primaryText,
    fontWeight: '700',
  },
  dayTextSelected: {
    color: c.onPrimary,
    fontWeight: '700',
  },
  dayTextDisabled: {
    color: c.textFaint,
    fontWeight: '400',
  },
}));
