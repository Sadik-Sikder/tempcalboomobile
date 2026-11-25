import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { makeStyles } from '../theme/ThemeContext';
import { useTranslation } from 'react-i18next';
import {
  buildMonthGrid,
  dateKey,
  formatDate,
  isSameMonth,
  weekdayLabels,
} from '../utils/calendarGrid';

interface Props {
  visible: boolean;
  title?: string;
  value: string | null; // YYYY-MM-DD
  onSelect: (date: string) => void;
  onClose: () => void;
}

function parseValue(value: string | null): Date | null {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  return isNaN(date.getTime()) ? null : date;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// Mirrors the web's custom-datepicker.component.ts: Sun-start 6-week grid,
// out-of-month and past days unselectable, "Today" shortcut, can't
// navigate to a month before the current one.
export function DatePickerModal({
  visible,
  title,
  value,
  onSelect,
  onClose,
}: Props) {
  const styles = useStyles();
  const { t } = useTranslation();
  const selected = useMemo(() => parseValue(value), [value]);
  const today = useMemo(() => new Date(), []);
  const todayStart = startOfDay(today);
  const [monthDate, setMonthDate] = useState(() => selected ?? today);

  // Reopen on the selected (or current) month rather than wherever the
  // grid was left after a previous close.
  useEffect(() => {
    if (visible) setMonthDate(selected ?? today);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const grid = useMemo(() => buildMonthGrid(monthDate), [monthDate]);
  const prevDisabled =
    monthDate.getFullYear() < today.getFullYear() ||
    (monthDate.getFullYear() === today.getFullYear() &&
      monthDate.getMonth() <= today.getMonth());

  const goPrev = () => {
    if (prevDisabled) return;
    setMonthDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  };
  const goNext = () =>
    setMonthDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  const goToday = () => {
    setMonthDate(new Date(today.getFullYear(), today.getMonth(), 1));
    onSelect(dateKey(today));
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={styles.title}>
            {title ?? t('MOBILE.PICKERS.SELECT_DATE')}
          </Text>

          <View style={styles.nav}>
            <Pressable
              onPress={goPrev}
              hitSlop={8}
              style={styles.navButton}
              disabled={prevDisabled}
            >
              <Text
                style={[
                  styles.navArrow,
                  prevDisabled && styles.navArrowDisabled,
                ]}
              >
                {'‹'}
              </Text>
            </Pressable>
            <View style={styles.navCenter}>
              <Text style={styles.monthLabel}>
                {formatDate(monthDate, { month: 'long', year: 'numeric' })}
              </Text>
              <Pressable onPress={goToday} hitSlop={6}>
                <Text style={styles.todayLink}>{t('CALENDAR.TODAY')}</Text>
              </Pressable>
            </View>
            <Pressable onPress={goNext} hitSlop={8} style={styles.navButton}>
              <Text style={styles.navArrow}>{'›'}</Text>
            </Pressable>
          </View>

          <View style={styles.weekdayRow}>
            {weekdayLabels().map(label => (
              <Text key={label} style={styles.weekdayLabel}>
                {label}
              </Text>
            ))}
          </View>

          <View style={styles.grid}>
            {grid.map(day => {
              const key = dateKey(day);
              const inMonth = isSameMonth(day, monthDate);
              const isPast = startOfDay(day) < todayStart;
              const isSelectable = inMonth && !isPast;
              const isSelected = !!selected && dateKey(selected) === key;
              const isToday = key === dateKey(today);
              return (
                <Pressable
                  key={key}
                  style={styles.cell}
                  disabled={!isSelectable}
                  onPress={() => onSelect(key)}
                >
                  <View
                    style={[
                      styles.dateBadge,
                      isSelected && styles.dateBadgeSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.dateText,
                        !isSelectable && styles.dateTextDim,
                        isToday && !isSelected && styles.dateTextToday,
                        isSelected && styles.dateTextSelected,
                      ]}
                    >
                      {day.getDate()}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const useStyles = makeStyles(c => ({
  backdrop: {
    flex: 1,
    backgroundColor: c.backdrop,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: c.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: c.text,
    marginBottom: 12,
  },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  navButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navArrow: {
    fontSize: 20,
    color: c.primaryText,
    fontWeight: '700',
  },
  navArrowDisabled: {
    color: c.textFaint,
  },
  navCenter: {
    alignItems: 'center',
    gap: 2,
    flex: 1,
  },
  monthLabel: {
    fontSize: 14.5,
    fontWeight: '700',
    color: c.text,
  },
  todayLink: {
    fontSize: 11.5,
    color: c.primaryText,
    fontWeight: '600',
  },
  weekdayRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  weekdayLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    color: c.textMuted,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateBadgeSelected: {
    backgroundColor: c.primary,
  },
  dateText: {
    fontSize: 13,
    fontWeight: '600',
    color: c.text,
  },
  dateTextDim: {
    color: c.textFaint,
  },
  dateTextToday: {
    color: c.primaryText,
    fontWeight: '800',
  },
  dateTextSelected: {
    color: c.onPrimary,
    fontWeight: '700',
  },
}));
