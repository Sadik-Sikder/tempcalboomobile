// Plain JS: it reads the source tree with Node's fs, which the app's
// TypeScript setup has no types for.
import fs from 'fs';
import path from 'path';
import dayjs from 'dayjs';
import i18n, {
  LANGUAGES,
  localeCode,
  resetLanguage,
  restoreLanguage,
  setLanguage,
} from '../src/i18n';

const ROOT = path.join(__dirname, '..');

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'i18n' ? [] : sourceFiles(full);
    }
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

// Every quoted UPPER.DOTTED string in the app is a translation key.
function usedKeys() {
  const files = [
    ...sourceFiles(path.join(ROOT, 'src')),
    path.join(ROOT, 'App.tsx'),
  ];
  const keys = new Set();
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    for (const match of text.matchAll(
      /['"]([A-Z][A-Z_]*(?:\.[A-Z0-9_]+)+)['"]/g,
    )) {
      keys.add(match[1]);
    }
  }
  return [...keys];
}

afterEach(async () => {
  await resetLanguage();
});

test('switches the text and dates to the chosen language', async () => {
  expect(i18n.t('MOBILE.COMMON.BACK')).toBe('Back');

  await setLanguage('French');
  expect(localeCode()).toBe('fr');
  expect(i18n.t('MOBILE.COMMON.BACK')).toBe('Retour');
  expect(i18n.t('NAV.EVENTS')).not.toBe('NAV.EVENTS');
  expect(dayjs('2026-11-10').format('dddd')).toBe('mardi');

  await setLanguage('Thai');
  expect(i18n.t('MOBILE.COMMON.BACK')).toBe('กลับ');
});

test('ignores values that are not one of the languages', async () => {
  await setLanguage('Klingon');
  await setLanguage('');
  expect(localeCode()).toBe('en');
});

test('remembers the language until sign-out', async () => {
  await setLanguage('German');
  await i18n.changeLanguage('en');
  await restoreLanguage();
  expect(localeCode()).toBe('de');

  await resetLanguage();
  await restoreLanguage();
  expect(localeCode()).toBe('en');
});

test.each(LANGUAGES)('%s has every key the app uses', async language => {
  await setLanguage(language);
  const missing = usedKeys().filter(
    key => !i18n.exists(key, { fallbackLng: [] }),
  );
  expect(missing).toEqual([]);
});
