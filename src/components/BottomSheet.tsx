import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  Pressable,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { makeStyles } from '../theme/ThemeContext';

interface Props {
  visible: boolean;
  onClose: () => void;
  // The screen's own sheet layout (padding, gap…).
  sheetStyle?: StyleProp<ViewStyle>;
  children: ReactNode;
}

const OPEN_MS = 260;
const CLOSE_MS = 200;
// Starts fully below the screen whatever the sheet's height.
const OFFSCREEN = Dimensions.get('window').height;

export function BottomSheet({ visible, onClose, sheetStyle, children }: Props) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  const translateY = useRef(new Animated.Value(OFFSCREEN)).current;
  const backdrop = useRef(new Animated.Value(0)).current;

  // What to show while sliding out, after the screen has cleared it.
  const [shownChildren, setShownChildren] = useState(children);
  useEffect(() => {
    if (visible) setShownChildren(children);
  }, [visible, children]);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 0,
          duration: OPEN_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(backdrop, {
          toValue: 1,
          duration: OPEN_MS,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: OFFSCREEN,
          duration: CLOSE_MS,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(backdrop, {
          toValue: 0,
          duration: CLOSE_MS,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        // Not finished means it was reopened mid-slide; stay mounted.
        if (finished) setMounted(false);
      });
    }
  }, [visible, translateY, backdrop]);

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <Animated.View style={[styles.backdrop, { opacity: backdrop }]}>
        <Pressable style={styles.fill} onPress={onClose} />
      </Animated.View>
      <Animated.View
        style={[
          styles.sheet,
          { paddingBottom: insets.bottom, transform: [{ translateY }] },
        ]}
      >
        <View style={sheetStyle}>{shownChildren}</View>
      </Animated.View>
    </Modal>
  );
}

const useStyles = makeStyles(c => ({
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: c.backdrop,
  },
  fill: {
    flex: 1,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '85%',
    backgroundColor: c.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
}));
