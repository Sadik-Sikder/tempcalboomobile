import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Modal, Pressable, Text, View } from 'react-native';
import { makeStyles } from '../theme/ThemeContext';
import { useTranslation } from 'react-i18next';

interface Props {
  visible: boolean;
  title?: string;
  value: string | null; // 24h "HH:mm"
  onSelect: (value: string) => void;
  onClose: () => void;
}

const ROW_HEIGHT = 44;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

const HOURS = Array.from({ length: 24 }, (_, i) => pad(i));
const MINUTES = Array.from({ length: 60 }, (_, i) => pad(i));

function parseTime(value: string | null): { hour: number; minute: number } {
  const match = value?.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return { hour: 9, minute: 0 };
  return {
    hour: Math.min(23, parseInt(match[1], 10)),
    minute: Math.min(59, parseInt(match[2], 10)),
  };
}

// Web's custom-time-picker.component.ts uses 12h hour/minute/AM-PM wheels;
// the form stores (and validates) 24h "HH:mm" either way, so this skips
// the AM/PM column entirely — one less thing to tap, nothing lost.
export function ClockPickerModal({
  visible,
  title,
  value,
  onSelect,
  onClose,
}: Props) {
  const styles = useStyles();
  const { t } = useTranslation();
  const initial = useMemo(() => parseTime(value), [value]);
  const [hour, setHour] = useState(initial.hour);
  const [minute, setMinute] = useState(initial.minute);
  const hourListRef = useRef<FlatList<string>>(null);
  const minuteListRef = useRef<FlatList<string>>(null);

  useEffect(() => {
    if (!visible) return;
    const parsed = parseTime(value);
    setHour(parsed.hour);
    setMinute(parsed.minute);
    // Centers each wheel on the current value instead of always opening
    // scrolled to the top, same as the web version's scrollToSelected.
    requestAnimationFrame(() => {
      hourListRef.current?.scrollToIndex({
        index: parsed.hour,
        animated: false,
        viewPosition: 0.5,
      });
      minuteListRef.current?.scrollToIndex({
        index: parsed.minute,
        animated: false,
        viewPosition: 0.5,
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const selectHour = (h: number) => {
    setHour(h);
    onSelect(`${pad(h)}:${pad(minute)}`);
  };
  const selectMinute = (m: number) => {
    setMinute(m);
    onSelect(`${pad(hour)}:${pad(m)}`);
  };

  const getItemLayout = (_: unknown, index: number) => ({
    length: ROW_HEIGHT,
    offset: ROW_HEIGHT * index,
    index,
  });

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
            {title ?? t('MOBILE.PICKERS.SELECT_TIME')}
          </Text>

          <View style={styles.columns}>
            <FlatList
              ref={hourListRef}
              data={HOURS}
              keyExtractor={h => h}
              style={styles.column}
              showsVerticalScrollIndicator={false}
              getItemLayout={getItemLayout}
              onScrollToIndexFailed={() => {}}
              renderItem={({ item, index }) => {
                const isSelected = index === hour;
                return (
                  <Pressable
                    style={[styles.row, isSelected && styles.rowSelected]}
                    onPress={() => selectHour(index)}
                  >
                    <Text
                      style={[
                        styles.rowText,
                        isSelected && styles.rowTextSelected,
                      ]}
                    >
                      {item}
                    </Text>
                  </Pressable>
                );
              }}
            />
            <Text style={styles.colon}>:</Text>
            <FlatList
              ref={minuteListRef}
              data={MINUTES}
              keyExtractor={m => m}
              style={styles.column}
              showsVerticalScrollIndicator={false}
              getItemLayout={getItemLayout}
              onScrollToIndexFailed={() => {}}
              renderItem={({ item, index }) => {
                const isSelected = index === minute;
                return (
                  <Pressable
                    style={[styles.row, isSelected && styles.rowSelected]}
                    onPress={() => selectMinute(index)}
                  >
                    <Text
                      style={[
                        styles.rowText,
                        isSelected && styles.rowTextSelected,
                      ]}
                    >
                      {item}
                    </Text>
                  </Pressable>
                );
              }}
            />
          </View>

          <Pressable style={styles.doneButton} onPress={onClose}>
            <Text style={styles.doneButtonText}>{t('MOBILE.COMMON.DONE')}</Text>
          </Pressable>
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
    marginBottom: 8,
  },
  columns: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: ROW_HEIGHT * 5,
  },
  column: {
    width: 80,
  },
  colon: {
    fontSize: 18,
    fontWeight: '700',
    color: c.text,
    marginHorizontal: 4,
  },
  row: {
    height: ROW_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  rowSelected: {
    backgroundColor: c.borderSoft,
  },
  rowText: {
    fontSize: 16,
    fontWeight: '500',
    color: c.text,
  },
  rowTextSelected: {
    color: c.primaryText,
    fontWeight: '700',
  },
  doneButton: {
    marginTop: 16,
    height: 46,
    borderRadius: 10,
    backgroundColor: c.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneButtonText: {
    color: c.onPrimary,
    fontWeight: '700',
    fontSize: 14.5,
  },
}));
