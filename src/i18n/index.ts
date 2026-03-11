import { create } from "zustand";
import { zh, type LocaleKeys } from "./zh";
import { en } from "./en";

export type Lang = "zh" | "en";

const LOCALES: Record<Lang, Record<LocaleKeys, string>> = { zh, en };

function detectLang(): Lang {
  const saved = localStorage.getItem("oc1-lang");
  if (saved === "zh" || saved === "en") return saved;
  return navigator.language.startsWith("zh") ? "zh" : "en";
}

interface I18nState {
  lang: Lang;
  setLang: (l: Lang) => void;
  toggleLang: () => void;
}

export const useI18n = create<I18nState>((set, get) => ({
  lang: detectLang(),
  setLang: (l) => {
    localStorage.setItem("oc1-lang", l);
    set({ lang: l });
  },
  toggleLang: () => {
    const next = get().lang === "zh" ? "en" : "zh";
    localStorage.setItem("oc1-lang", next);
    set({ lang: next });
  },
}));

export function useT() {
  const lang = useI18n((s) => s.lang);
  const dict = LOCALES[lang];
  return (key: LocaleKeys) => dict[key];
}

export type { LocaleKeys };
