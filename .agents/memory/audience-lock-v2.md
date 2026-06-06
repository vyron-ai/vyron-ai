---
name: Audience Lock Engine V2
description: Prevents audience drift in generated content — keeps output locked to user's original audience profile, blocks banned business archetypes.
---

## Architecture

Three components added to server/index.js before the Context Engine V2 section:

1. **`_AUDIENCE_BLACKLIST_ES` / `_AUDIENCE_BLACKLIST_EN`** — static lists of banned archetypes (empresarios, emprendedores, ejecutivos, directores, fundadores, ceos, clientes ideales, inversores, gerentes / EN equivalents).

2. **`_SUBJECT_SYNONYMS`** — maps normalized subject nouns to safe masculine/neutral alternatives (e.g., "jovenes" → ["jóvenes","jóvenes profesionales"]). Only masculine/neutral options to preserve grammatical compatibility with "los ___" template patterns.

3. **`audienceLock(au, n, isES)`** — parses audience into subject+goal (via existing `ceSubject`/`ceGoal`), builds per-input blacklist (filtered against original text), uses `industryProfile.phrases` for goal rephrasing (converting 2nd→3rd person), cross-products subjects×connectors×goals for up to 10 safe variants.

4. **`audiencePurityScan(outputObj, blacklist)`** — scans stringified output for blacklisted terms, returns `{ score, violations, contamination }`. Score = max(0, 100 - violations×15).

## Integration

- **`ceAuVars(au, n, isES)`** — now calls `audienceLock` and returns `lock.variants`. Signature changed from `(au, isES)` to `(au, n, isES)`.
- **`ctxBuild`** — updated call: `ceAuVars(au, n, isES)` (passes niche for industry profile access).
- **Script generate handler** — after building body+cta+title, calls `audienceLock` + `audiencePurityScan`, logs debug box to console, includes `audienceConsistencyScore` in response JSON.

## Validated behavior (Barbería test)

Input: audience = "jóvenes que quieren verse profesionales"

Debug output:
- Detected Subject: jóvenes
- Detected Goal: verse profesionales
- Safe Variants: 10
- Blocked Terms: 20
- Consistency Score: 100/100
- No contamination detected

Variants rotate correctly across body fields:
- "jóvenes que quieren verse profesionales" (original — first occurrences)
- "jóvenes que quieren verse mejor" (goal rephrase — 3rd+ occurrences)
- "jóvenes que quieren proyectar seguridad" (industry phrase rephrase)

**Why:** `ceAuVars` previously returned "emprendedores que priorizan resultados" and "clientes ideales" as variants — both are now blocked by the blacklist. All variants now stay within the user's original demographic+goal profile.

## Grammar constraint preserved

All variants in `_SUBJECT_SYNONYMS` are masculine/neutral plural nouns (compatible with "los ___" templates). "personas" avoided as a variant to prevent "los personas" gender error.
