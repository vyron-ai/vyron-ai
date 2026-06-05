import { createContext, useContext, useState } from "react";

export const BUSINESS_STAGES = [
  "Principiante",
  "Microempresa",
  "Pequeña empresa",
  "Mediana empresa",
  "Empresa grande",
] as const;

export type BusinessStage = typeof BUSINESS_STAGES[number];
export type Language = "Español" | "English";

interface SettingsCtx {
  language:         Language;
  setLanguage:      (l: Language) => void;
  businessStage:    BusinessStage;
  setBusinessStage: (s: BusinessStage) => void;
}

const SettingsContext = createContext<SettingsCtx>({
  language:         "Español",
  setLanguage:      () => {},
  businessStage:    "Microempresa",
  setBusinessStage: () => {},
});

function read<T>(key: string, fallback: T): T {
  try { return (localStorage.getItem(key) as T) ?? fallback; } catch { return fallback; }
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [language, setLang] = useState<Language>(() =>
    read<Language>("vyron_language", "Español")
  );
  const [businessStage, setStage] = useState<BusinessStage>(() =>
    read<BusinessStage>("vyron_stage", "Microempresa")
  );

  const setLanguage = (l: Language) => {
    setLang(l);
    try { localStorage.setItem("vyron_language", l); } catch {}
  };
  const setBusinessStage = (s: BusinessStage) => {
    setStage(s);
    try { localStorage.setItem("vyron_stage", s); } catch {}
  };

  return (
    <SettingsContext.Provider value={{ language, setLanguage, businessStage, setBusinessStage }}>
      {children}
    </SettingsContext.Provider>
  );
}

export const useVyronSettings = () => useContext(SettingsContext);
