import { useTranslation } from "react-i18next";
import { useCallback } from "react";
import { changeLanguage } from "@/i18n";
import { LOCALES, asLocale, nextLocale, type Locale } from "@/lib/locale";

export function useLocale() {
  const { i18n } = useTranslation();

  const language = asLocale(i18n.language);

  // Route every toggle through the i18n bootstrap's `changeLanguage`, which
  // lazy-loads the target locale's catalogues BEFORE flipping the language, so
  // the switch never renders a raw key (SLICE 8).
  const setLanguage = useCallback((lng: Locale) => {
    void changeLanguage(lng);
  }, []);

  const toggleLanguage = useCallback(() => {
    void changeLanguage(nextLocale(language));
  }, [language]);

  return {
    language,
    setLanguage,
    toggleLanguage,
    supportedLanguages: LOCALES,
  };
}
