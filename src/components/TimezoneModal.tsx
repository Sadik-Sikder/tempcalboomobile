import { FlatList, Modal, Pressable, Text } from 'react-native';
import { makeStyles } from '../theme/ThemeContext';
import { useTranslation } from 'react-i18next';

interface Props {
  visible: boolean;
  zones: string[];
  selectedZone: string;
  onSelect: (zone: string) => void;
  onClose: () => void;
}

export function TimezoneModal({
  visible,
  zones,
  selectedZone,
  onSelect,
  onClose,
}: Props) {
  const styles = useStyles();
  const { t } = useTranslation();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={styles.title}>{t('EVENT_FORM.SELECT_TIME_ZONE')}</Text>
          <FlatList
            data={zones}
            keyExtractor={zone => zone}
            initialNumToRender={30}
            style={styles.list}
            renderItem={({ item }) => {
              const selected = item === selectedZone;
              return (
                <Pressable
                  style={[styles.row, selected && styles.rowSelected]}
                  onPress={() => onSelect(item)}
                >
                  <Text
                    style={[styles.rowText, selected && styles.rowTextSelected]}
                  >
                    {item}
                  </Text>
                </Pressable>
              );
            }}
          />
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
    paddingHorizontal: 12,
    maxHeight: '70%',
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: c.text,
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  list: {
    marginBottom: 12,
  },
  row: {
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  rowSelected: {
    backgroundColor: c.borderSoft,
  },
  rowText: {
    fontSize: 13.5,
    fontWeight: '500',
    color: c.text,
  },
  rowTextSelected: {
    color: c.primaryText,
    fontWeight: '700',
  },
}));
