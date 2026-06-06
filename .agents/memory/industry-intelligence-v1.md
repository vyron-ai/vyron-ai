---
name: Industry Intelligence Engine V1
description: Design decisions and integration points for the niche-detection + industry vocabulary layer in server/index.js.
---

## Architecture

Three components added to server/index.js (in order of definition):

1. **`_INDUSTRY_MAP`** — array of 12 industry objects, each with `match[]` (detection keywords, ES+EN mixed), `es` and `en` sub-objects containing: `synonyms`, `keywords`, `phrases`, `desires`, `fears`, `pains`, `transformation`.

2. **`_INDUSTRY_FALLBACK`** — generic business vocabulary for unknown niches (replaces old generic terms "este negocio/servicio/propuesta").

3. **`industryProfile(n, isES)`** — detects industry via substring matching on normalized niche string, returns ES or EN profile object.

## Integration points

- **`ceNVars(n, isES)`** — calls `industryProfile` to get `synonyms[]` as the rotation pool instead of hard-coded "este negocio/sector/espacio/mercado". These industry synonyms are what the Context Engine rotates in when the niche phrase exceeds the repetition budget.

- **`buildAudienceIntelligence(n, au, au1, pr, hookType, intensity, isES)`** — uses `profile.desires/fears/pains/transformation` and `profile.keywords[0..2]` as template variables injected into the 4×4 variant arrays.

## Detection order matters

Industries are checked in array order — first match wins. Keep more-specific patterns earlier in `_INDUSTRY_MAP` if there's overlap risk (e.g. "fitness" before "salud").

## Industries covered (12)

Barbería/Salón, Gym/Fitness, Dentista, Restaurante, Abogado/Legal, Marketing/Agencia, Inmobiliaria, Coaching/Educación, Finanzas, Salud/Bienestar, Tecnología, E-commerce.

## Validated behavior (Barbería test)

Niche = "Barbería", Audience = "jóvenes que quieren verse profesionales"

Expected keywords in output: imagen(7), presencia(2), apariencia(3), confianza(1), primera impresión(1) — all confirmed.
Zero occurrences of banned terms: "este sector", "este espacio", "la industria", "tu mercado".
Context Engine rotates niche to synonyms: "la imagen personal", "el cuidado personal", "el grooming" appear naturally across fields.

**Why:** `ceNVars` now returns `[n, short, ...profile.synonyms]` — industry synonyms like "la imagen personal" or "el grooming" replace the previous generic pool of "este negocio/sector/espacio/mercado".
