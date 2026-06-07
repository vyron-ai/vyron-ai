---
name: Business Stage Intelligence V1
description: buildStageIntelligence wires 5-stage differentiation through Script Engine, Content Planner, and Content Strategy. Each stage produces structurally different CTA, script context, content topics, and strategy notes.
---

## Rule
`buildStageIntelligence(stage, n, pr, au, isES)` must be called after `buildTransformation` and before any template selection in all three handlers. The result `si` is not passed to `buildAudienceIntelligence` — it's used independently to override CTA and inject stage context.

**Why:** The business stage selector existed visually but all stages produced near-identical output. The fix is a separate intelligence layer that returns stage-specific overlays rather than modifying the core template maps, keeping separation of concerns clean.

## 5 Stage Detection (regex on normalized stage string)
- Principiante: `/principiante|beginner|starter/`
- Pequeña empresa: `/peque[ñn]|small/`
- Mediana empresa: `/mediana|medium/`
- Empresa grande: `/grande|large|corp|enterprise/`
- Microempresa: default (no regex match needed)

## Return Shape
```js
{
  label,           // display name
  vocabulary,      // 7 stage-specific terms (not yet injected into templates)
  scriptContext,   // paragraph appended to script body (stage-specific framing)
  sarResolve,      // override for SAR RESOLVE (not yet actively injected)
  painContext,     // stage-specific pain framing (not yet actively injected)
  ctaPool,         // array of 4 CTAs — replaces generic ctaMap entirely
  plannerTopics,   // 5 stage-specific topic titles for content planner
  strategyFocus,   // paragraph added to reasoning.stageStrategy in content strategy
  weeklyNote,      // short note appended to every weekly schedule day note
}
```

## Wiring Points
- **Script Engine**: `const si = buildStageIntelligence(...)` after `const tr`; `script: (activeScriptMap[hookType] ...) + si.scriptContext`; `cta = ctxApply(pick(si.ctaPool), ...)`; response includes `stageLabel` + `stageVocabulary`.
- **Content Planner**: `const si = ...` after `const tr`; every entry CTA = `si.ctaPool[i % si.ctaPool.length]`; every 5th entry title (i%5===2) = `si.plannerTopics[...]`.
- **Content Strategy**: `const tr` + `const si` added before activeWhyMix selection; `rawReasoning.stageStrategy = si.strategyFocus`; `rawCtas.stageSpecific = pick(si.ctaPool)`; weekly note appended to each day.

## How to Apply
When adding a new AI module that accepts `businessStage`: call `buildStageIntelligence` immediately after `buildTransformation`, then use `si.ctaPool` for CTAs and `si.scriptContext` / `si.strategyFocus` for body injection.

## Validated Differentiation (Barbería / Corte premium / ES)
- Principiante: "primeros clientes, primer paso, confianza inicial" — CTA: "Comenta GUÍA y te muestro por dónde empezar"
- Microempresa: "ventas locales, WhatsApp, bajo presupuesto" — CTA: "Comenta CLIENTES y te mando el plan simple"
- Pequeña empresa: "sistema, proceso repetible, posicionamiento" — CTA: "Comenta SISTEMA y te envío la estructura"
- Mediana empresa: "métricas, CRM, conversión, seguimiento" — CTA: "Audita tu proceso antes de invertir más. Comenta DIAGNÓSTICO"
- Empresa grande: "escalabilidad, departamentos, dashboards, consistencia de marca" — CTA: "Comenta ESCALA y te enviamos el diagnóstico"
