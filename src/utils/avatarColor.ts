import { palette } from '../constants/colors';

const PALETTE = [
  palette.brandPurple,
  palette.brandAccent,
  palette.cyan,
  palette.amberDark,
  palette.green,
];

export function avatarColorForLetter(letter: string): string {
  if (!letter) return palette.brandPurple;
  const index = letter.toUpperCase().charCodeAt(0) % PALETTE.length;
  return PALETTE[index] || palette.brandPurple;
}
