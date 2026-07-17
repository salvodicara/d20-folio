import { useTranslation } from "react-i18next";
import { useCallback } from "react";
import { changeLanguage } from "@/i18n";

const SUPPORTED_LANGUAGES = ["en", "it"] as const;
type Language = (typeof SUPPORTED_LANGUAGES)[number];

export function useLocale() {
  const { i18n } = useTranslation();

  const language = (i18n.language || "en") as Language;

  // Route every toggle through the i18n bootstrap's `changeLanguage`, which
  // lazy-loads the target locale's catalogues BEFORE flipping the language, so
  // the switch never renders a raw key (SLICE 8).
  const setLanguage = useCallback((lng: Language) => {
    void changeLanguage(lng);
  }, []);

  const toggleLanguage = useCallback(() => {
    const next = language === "en" ? "it" : "en";
    void changeLanguage(next);
  }, [language]);

  return {
    language,
    setLanguage,
    toggleLanguage,
    supportedLanguages: SUPPORTED_LANGUAGES,
  };
}
