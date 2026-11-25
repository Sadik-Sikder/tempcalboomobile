import { createContext, useContext, type ReactNode } from 'react';
import { StyleSheet, useColorScheme } from 'react-native';
import { darkColors, lightColors, type ThemeColors } from '../constants/colors';

// Every screen reads its colors through useTheme()/makeStyles now, but
// the dark set hasn't been checked screen by screen yet, so this stays
// off until it has. Turning it on also means switching AppTheme in
// android/app/src/main/res/values/styles.xml back to a DayNight parent,
// so native dialogs match.
const DARK_MODE_ENABLED = false;

export interface Theme {
  dark: boolean;
  colors: ThemeColors;
}

const lightTheme: Theme = { dark: false, colors: lightColors };
const darkTheme: Theme = { dark: true, colors: darkColors };

const ThemeContext = createContext<Theme>(lightTheme);

// Follows the phone's light/dark setting (once enabled), re-rendering
// everything below it when that changes — the role an injected theme
// service plays in Angular.
export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  const theme = DARK_MODE_ENABLED && scheme === 'dark' ? darkTheme : lightTheme;
  return (
    <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

// StyleSheet.create from a function of the theme's colors, as a hook:
//
//   const useStyles = makeStyles(c => ({
//     card: { backgroundColor: c.surface },
//   }));
//   …
//   const styles = useStyles();
//
// Each theme's sheet is built once, the first time it's needed, so
// calling the hook on every render costs a lookup.
export function makeStyles<S extends StyleDefinitions>(
  build: (c: ThemeColors) => S & StyleDefinitions,
) {
  const sheets = new Map<Theme, Readonly<S>>();
  return function useStyles(): Readonly<S> {
    const theme = useTheme();
    const cached = sheets.get(theme);
    if (cached) return cached;
    const sheet = StyleSheet.create(build(theme.colors));
    sheets.set(theme, sheet);
    return sheet;
  };
}

// Whatever StyleSheet.create accepts (RN 0.87's generated types don't
// export a name for it).
type StyleDefinitions = Parameters<typeof StyleSheet.create>[0];
