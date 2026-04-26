export type AppLanguage = 'en' | 'sq';

const KEY = 'guri_language';
const EVT = 'guri-language-changed';

export const getLanguage = (): AppLanguage => {
  const raw = (localStorage.getItem(KEY) || 'en').toLowerCase();
  return raw === 'sq' ? 'sq' : 'en';
};

export const setLanguage = (lang: AppLanguage): void => {
  localStorage.setItem(KEY, lang);
  window.dispatchEvent(new CustomEvent(EVT, { detail: { lang } }));
};

export const languageChangedEvent = EVT;
