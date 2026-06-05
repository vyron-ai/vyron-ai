import { Building2, Globe2 } from "lucide-react";
import { useVyronSettings, BUSINESS_STAGES, type Language } from "@/contexts/settings-context";

const LANGUAGES: Language[] = ["Español", "English"];

export function BusinessSettings() {
  const { language, setLanguage, businessStage, setBusinessStage } = useVyronSettings();

  return (
    <div className="glass border border-border/60 rounded-xl px-4 py-3 flex flex-wrap items-center gap-4">
      <div className="flex items-center gap-2 flex-1 min-w-[180px]">
        <Building2 size={14} className="text-primary shrink-0" />
        <label className="text-xs text-muted-foreground shrink-0">Etapa:</label>
        <select
          value={businessStage}
          onChange={e => setBusinessStage(e.target.value as typeof businessStage)}
          className="flex-1 min-w-0 bg-transparent text-sm font-medium text-foreground border-none outline-none cursor-pointer appearance-none"
        >
          {BUSINESS_STAGES.map(s => (
            <option key={s} value={s} className="bg-background text-foreground">{s}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <Globe2 size={14} className="text-primary shrink-0" />
        <div className="flex rounded-lg border border-border overflow-hidden">
          {LANGUAGES.map(lang => (
            <button
              key={lang}
              onClick={() => setLanguage(lang)}
              className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                language === lang
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              }`}
            >
              {lang === "Español" ? "ES" : "EN"}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
