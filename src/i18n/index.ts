import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import dayjs from 'dayjs';
import 'dayjs/locale/fr';
import 'dayjs/locale/es';
import 'dayjs/locale/de';
import 'dayjs/locale/th';
import 'dayjs/locale/ms';

// The app's text in each language, the mobile side of the web app's
// ngx-translate setup. Components read it with react-i18next:
//
//   const { t } = useTranslation();
//   <Text>{t('PROFILE.EDIT.NAME_LABEL')}</Text>
//
// and every component using t() re-renders when the language changes,
// like the web's `| translate` pipe.
//
// Two sets of files per language, merged:
// - web/: copies of calbook/public/assets/i18n/*.json, so both apps say the
//   same thing. Don't edit them here; edit the web files and run
//   `npm run sync-i18n`.
// - mobile/: text only this app has, all under a MOBILE key so it can
//   never collide with a web key.
import webEnglish from './web/English.json';
import webFrench from './web/French.json';
import webSpanish from './web/Spanish.json';
import webGerman from './web/German.json';
import webThai from './web/Thai.json';
import webMalay from './web/Malay.json';
import mobileEnglish from './mobile/English.json';
import mobileFrench from './mobile/French.json';
import mobileSpanish from './mobile/Spanish.json';
import mobileGerman from './mobile/German.json';
import mobileThai from './mobile/Thai.json';
import mobileMalay from './mobile/Malay.json';

// Named the way the backend stores a user's `language` (and the web's file
// names), so a profile's value can be passed straight to setLanguage().
export const LANGUAGES = [
  'English',
  'French',
  'Spanish',
  'German',
  'Thai',
  'Malay',
] as const;
export type Language = (typeof LANGUAGES)[number];

const STORAGE_KEY = 'language';

// i18next, dayjs and Intl all name a language by its standard code. The
// names above are only how the backend and the web store it (i18next
// lowercases anything else, so it couldn't find "English" resources).
const LOCALE_CODES: Record<Language, string> = {
  English: 'en',
  French: 'fr',
  Spanish: 'es',
  German: 'de',
  Thai: 'th',
  Malay: 'ms',
};

const FALLBACK = LOCALE_CODES.English;

// The code for the current language ("fr"): dayjs's locale name too.
export function localeCode(): string {
  return i18n.language || FALLBACK;
}

// The locale to hand Intl.DateTimeFormat. Thai asks for the Gregorian
// calendar: Intl's Thai default counts years in the Buddhist era (2569),
// which would disagree with every date dayjs formats.
export function intlLocale(): string {
  const code = localeCode();
  return code === 'th' ? 'th-u-ca-gregory' : code;
}

const resources = {
  en: { translation: { ...webEnglish, ...mobileEnglish } },
  fr: { translation: { ...webFrench, ...mobileFrench } },
  es: { translation: { ...webSpanish, ...mobileSpanish } },
  de: { translation: { ...webGerman, ...mobileGerman } },
  th: { translation: { ...webThai, ...mobileThai } },
  ms: { translation: { ...webMalay, ...mobileMalay } },
};

function isLanguage(value: unknown): value is Language {
  return LANGUAGES.includes(value as Language);
}

i18n.use(initReactI18next).init({
  resources,
  lng: FALLBACK,
  // A key missing from one language shows the English text, not the key.
  fallbackLng: FALLBACK,
  // Everything is bundled, so init finishes before the first render.
  initAsync: false,
  // React already escapes text; escaping here would show "&amp;" etc.
  interpolation: { escapeValue: false },
});

// Dates follow the language too: dayjs().format('dddd D MMMM') gives
// "mardi 12 novembre" in French. Only names change; the calendar grids
// build their own Sunday-first weeks, so the layout stays put.
i18n.on('languageChanged', () => {
  dayjs.locale(localeCode());
});

// The language the user last chose, so the app (the Login screen
// included) opens in it instead of flashing English until /userinfo
// arrives. Mirrors getInitialLang() in the web's app.config.ts.
export async function restoreLanguage(): Promise<void> {
  const saved = await AsyncStorage.getItem(STORAGE_KEY);
  if (isLanguage(saved)) await i18n.changeLanguage(LOCALE_CODES[saved]);
}

// Switches every mounted screen to `language` and remembers it. Anything
// that isn't one of LANGUAGES (an empty profile field, say) is ignored.
export async function setLanguage(language: unknown): Promise<void> {
  if (!isLanguage(language)) return;
  const code = LOCALE_CODES[language];
  if (i18n.language !== code) await i18n.changeLanguage(code);
  await AsyncStorage.setItem(STORAGE_KEY, language);
}

// Signing out forgets the language with the rest of the account, as the
// web's logout does.
export async function resetLanguage(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
  await i18n.changeLanguage(FALLBACK);
}

export default i18n;
