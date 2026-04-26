import { useEffect, useState } from 'react';
import { getLanguage, languageChangedEvent, AppLanguage } from './language';

export const useLanguage = (): AppLanguage => {
  const [lang, setLang] = useState<AppLanguage>(() => getLanguage());

  useEffect(() => {
    const onChange = () => setLang(getLanguage());
    window.addEventListener(languageChangedEvent, onChange as EventListener);
    return () => window.removeEventListener(languageChangedEvent, onChange as EventListener);
  }, []);

  return lang;
};
