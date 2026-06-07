---
name: Transformation Engine V1
description: buildTransformation wires a 7-dimension profile through every Script Engine and Content Planner template, replacing generic industry language with product-specific transformation language.
---

## Rule
`buildTransformation(n, pr, isES)` must be called before `buildAudienceIntelligence` in any handler that generates script or content. The result `tr` is passed as the 8th argument to `buildAudienceIntelligence(n, au, au1, pr, hookType, intensity, isES, tr)`.

**Why:** All templates (sarMap, painMap, curiosityMap, scriptMap, ctaMap, titleMap — both EN and ES) reference `tr.*` directly. If `tr` is missing, every template will output `undefined` for the transformation dimensions. `buildAudienceIntelligence` falls back to `industryProfile` language when `tr` is null, so it is safe to omit only if the caller intentionally wants generic output.

## 7 Dimensions
- `visibleProduct` — the literal product/service name
- `hiddenDesire` — what the customer actually wants (beyond the product)
- `emotionalTransformation` — the feeling they want to reach
- `socialTransformation` — how others will perceive them after
- `practicalOutcome` — the concrete, visible result
- `fearAvoided` — the outcome they are afraid of
- `identityShift` — the identity they step into

## Archetypes (8)
Appearance, Physical, Health, Experience, Business, Legal, Education, Property + generic fallback. Detection uses keyword matching on niche string.

## How to Apply
- Script handler: add `const tr = buildTransformation(n, pr, isES);` after `const isES = ...`, before `buildAudienceIntelligence` call.
- Content Planner handler: same — add after `const isES = language !== "English";`.
- Any new template map: reference `tr.hiddenDesire`, `tr.practicalOutcome`, `tr.emotionalTransformation`, `tr.fearAvoided`, `tr.identityShift`, `tr.socialTransformation` as needed.

## Validated Test Case
- Language=Español, Niche=Barbería, Product=Corte premium, Audience=jóvenes que quieren verse profesionales
- `practicalOutcome` = "apariencia mejorada, presencia más fuerte, imagen profesional"
- `hiddenDesire` = "verse bien y causar una primera impresión que no pide disculpas"
- `socialTransformation` = "respeto inmediato, autoridad visual, ser recordado por cómo se presenta"
- All 6 script engine fields + content planner titles/CTAs confirmed to contain tr.* values.
