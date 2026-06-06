---
name: Context Engine V2 — phrase variation design rules
description: Rules and constraints for the VYRON Context Engine V2 that prevents phrase repetition in generated outputs.
---

## Core rules

- `ctxBuild(n, au, pr, isES, maxPerField=1, maxGlobal=3)` — stateful applier, one per report batch. Closures in `state.{auG,nG,prG,auVI,nVI,prVI}` track global counts.
- `ctxApply` = fresh `ctxBuild(maxPerField=1, maxGlobal=1)` per call — used for Content Planner titles/CTAs per entry.
- `ctxBatch(fields, n, au, pr, isES, maxGlobal=3)` — one shared `ctxBuild` across the whole object.

## Script Engine separation pattern

Body fields (desires/fears/pains/transformation/sarTrigger/painTrigger/curiosityTrigger/script) go through `ctxBatch(..., maxGlobal=2)`. Title and CTA are processed SEPARATELY with independent `ctxApply` calls so they always get the original phrase once (not exhausted by body text budget).

**Why:** When title/CTA were inside `ctxBatch` they always received replaced variations because body fields consumed the global budget first.

## ceAuVars grammar constraint (Spanish)

All Spanish audience variations MUST be noun phrases compatible with "los ___". NEVER use:
- "quienes..." — "los quienes" is wrong Spanish
- "tu/su/mi ..." (possessives) — "los tu cliente ideal" is wrong
- "personas que..." — "personas" is feminine, creates "los personas" (should be "las")

Use "clientes", "emprendedores", "profesionales" (masculine/neutral) as variation subjects.

**Why:** Templates use `los ${au}` pattern throughout; substituting feminine/relative-pronoun variants creates broken Spanish.

## au1 computation

For complex "X que Y" audience phrases, `au1 = ceSubject(au, isES).split(/\s+/)[0]` — uses only the subject noun. Plain `au.replace(/s$/, "")` creates nonsense like "jóvenes que quieren verse profesionale".

## buildHashtags

Keyword extraction: kw(n).slice(0,2) + kw(pr).slice(0,2) + kw(au).slice(0,1) → map to "#keyword" → fill to 7 with contextual tags. Uses NFD normalization to strip diacritics. Never concatenates full phrases.
