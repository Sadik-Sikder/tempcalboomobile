import { FlatList, Modal, Pressable, Text } from 'react-native';
import { makeStyles } from '../theme/ThemeContext';

interface Props {
  visible: boolean;
  title: string;
  options: string[];
  selected: string | null;
  onSelect: (value: string) => void;
  onClose: () => void;
}

export function TimePickerModal({
  visible,
  title,
  options,
  selected,
  onSelect,
  onClose,
}: Props) {
  const styles = useStyles();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={styles.title}>{title}</Text>
          <FlatList
            data={options}
            keyExtractor={value => value}
            initialNumToRender={24}
            style={styles.list}
            contentContainerStyle={{ paddingBottom: 24 }}
            renderItem={({ item }) => {
              const isSelected = item === selected;
              return (
                <Pressable
                  style={[styles.row, isSelected && styles.rowSelected]}
                  onPress={() => onSelect(item)}
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
