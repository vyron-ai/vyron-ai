---
name: Global Language + Stage Selectors
description: How the Español/English toggle and business stage selector are implemented across all 5 AI modules.
---

## Architecture
- **Context**: `src/contexts/settings-context.tsx` — `SettingsProvider` + `useVyronSettings` hook, persists to localStorage. Exports `BUSINESS_STAGES` array and `Language` type.
- **UI component**: `src/components/business-settings.tsx` — compact ES/EN toggle + stage dropdown. Placed below the header in all 5 module pages.
- **App wrap**: `src/App.tsx` wraps with `<SettingsProvider>` inside WouterRouter, wrapping AuthProvider.

## 5 Module Pages (all completed)
- `script-engine.tsx`, `content-planner.tsx`, `content-strategy.tsx` — pass `{ language, businessStage }` in fetch body to server endpoints.
- `sales-diagnostic.tsx`, `lead-recovery.tsx` — client-side heuristic engines; use `t(es, en)` helper to toggle Spanish/English text at render time.

## Server Pattern (`server/index.js`)
Each of the 3 server endpoints (`/api/script/generate`, `/api/content-planner/generate`, `/api/content-strategy/generate`) extracts `language` and `businessStage` from `req.body`, sets `const isES = language !== "English"`, then selects between parallel EN/ES template maps.

**Key pattern**:
```js
const activeMap = isES ? mapES : mapEN;
res.json({ field: pick(activeMap[key] ?? activeMap.fallback) });
```

`buildAudienceIntelligence(n, au, au1, pr, hookType, intensity, isES)` also accepts `isES` and returns Spanish desire/fear/pain/transformation variants when true.

## Lead Recovery specifics
- Module-level constants: `SIGNAL_WHY_LOST_ES`, `SIGNAL_ACTION_ES`, `SIGNAL_TIMING_ES`, `STATUS_WHY_LOST_ES`, `STATUS_ACTION_ES`, `STATUS_TIMING_ES` — Spanish parallels of all EN signal/status maps.
- `buildRecoveryMessageES(...)` — full Spanish recovery message function, signal-driven with status fallbacks.
- Inside component: selects `active*` map based on `language === "Español"`.

## Business Stage values
`["Principiante", "Microempresa", "Pequeña empresa", "Mediana empresa", "Empresa grande"]`  
Default language: `"Español"`. Default stage: `"Microempresa"`.

**Why:** The app targets Latin American SMBs. Spanish is the primary market language; stage context helps calibrate AI output tone and content complexity.
