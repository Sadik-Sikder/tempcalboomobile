import { Image, Text, View } from 'react-native';
import { makeStyles } from '../theme/ThemeContext';
import { avatarColorForLetter } from '../utils/avatarColor';

interface Props {
  email: string;
  imageUrl?: string | null;
  size?: number;
}

// Matches web's header avatar: uploaded photo if present, else a colored
// circle with the EMAIL's first letter (not name) — see
// dashboard.component.html's `userData?.data?.email?.charAt(0)`.
export function Avatar({ email, imageUrl, size = 40 }: Props) {
  const styles = useStyles();
  const dimension = { width: size, height: size, borderRadius: size / 2 };
  if (imageUrl) {
    return (
      <Image source={{ uri: imageUrl }} style={[styles.image, dimension]} />
    );
  }
  const letter = (email || '?').charAt(0).toUpperCase();
  return (
    <View
      style={[
        styles.fallback,
        dimension,
        { backgroundColor: avatarColorForLetter(letter) },
      ]}
    >
      <Text style={[styles.letter, { fontSize: size * 0.4 }]}>{letter}</Text>
    </View>
  );
}

const useStyles = makeStyles(c => ({
  image: {
    backgroundColor: c.borderSoft,
  },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  letter: {
    color: c.onPrimary,
    fontWeight: '700',
  },
}));
