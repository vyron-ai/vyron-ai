import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useVyronSettings } from "@/contexts/settings-context";
import { BusinessSettings } from "@/components/business-settings";
import {
  Activity, TrendingDown, TrendingUp, AlertTriangle, AlertCircle,
  DollarSign, Users, Target, Zap, ArrowRight, BarChart3,
  ShieldAlert, CheckCircle2, CircleDot, Lightbulb, Clock,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────
type TrafficSource = "Facebook" | "Instagram" | "TikTok" | "Google" | "Referidos" | "WhatsApp" | "Mixto";
type ResponseTime  = "menos5min" | "menos1h" | "menos24h" | "mas24h";
type FollowUp      = "ninguno" | "manual" | "crmBasico" | "crmAvanzado";
type YesNo         = "si" | "no";

interface Bottleneck {
  rank:        1 | 2 | 3;
  label:       string;
  description: string;
  impact:      number;
  severity:    "critical" | "high" | "medium" | "low";
}

interface DiagnosticResult {
  score:       number;
  scoreLabel:  string;
  scoreColor:  string;
  bottlenecks: Bottleneck[];
  actions:     { priority: number; title: string; text: string }[];
  opportunity: string;
  convRate:    number;
  lostSales:   number;
  potentialRevenue: number;
}

// ── Pill selector ──────────────────────────────────────────────────────────────
function PillSelector<T extends string>({
  options, value, onChange,
}: {
  options:  { value: T; label: string }[];
  value:    T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
            value === o.value
              ? "bg-primary text-primary-foreground border-primary electric-glow"
              : "bg-background/40 text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ── Section header ─────────────────────────────────────────────────────────────
function SectionHeader({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 px-1 pt-2 pb-1">
      <span className="text-primary">{icon}</span>
      <span className="text-xs font-bold text-primary uppercase tracking-wider">— {label}</span>
    </div>
  );
}

// ── Severity config ─────────────────────────────────────────────────────────────
const SEV: Record<string, { border: string; bg: string; text: string; badge: string; icon: React.ReactNode }> = {
  critical: {
    border: "border-red-500/40",
    bg:     "bg-red-500/5",
    text:   "text-red-400",
    badge:  "bg-red-500/15 text-red-400 border-red-500/30",
    icon:   <AlertCircle size={14} className="text-red-400 shrink-0" />,
  },
  high: {
    border: "border-orange-500/40",
    bg:     "bg-orange-500/5",
    text:   "text-orange-400",
    badge:  "bg-orange-500/15 text-orange-400 border-orange-500/30",
    icon:   <ShieldAlert size={14} className="text-orange-400 shrink-0" />,
  },
  medium: {
    border: "border-amber-500/40",
    bg:     "bg-amber-500/5",
    text:   "text-amber-400",
    badge:  "bg-amber-500/15 text-amber-400 border-amber-500/30",
    icon:   <AlertTriangle size={14} className="text-amber-400 shrink-0" />,
  },
  low: {
    border: "border-green-500/40",
    bg:     "bg-green-500/5",
    text:   "text-green-400",
    badge:  "bg-green-500/15 text-green-400 border-green-500/30",
    icon:   <CheckCircle2 size={14} className="text-green-400 shrink-0" />,
  },
};

// ── Score arc component ────────────────────────────────────────────────────────
function ScoreGauge({ score, label, color }: { score: number; label: string; color: string }) {
  const radius = 54;
  const circumference = Math.PI * radius;
  const filled = (score / 100) * circumference;
  const arcColor =
    score >= 80 ? "#22c55e" :
    score >= 60 ? "#6366f1" :
    score >= 40 ? "#f59e0b" :
                  "#ef4444";

  return (
    <div className="flex flex-col items-center gap-3">
      <svg width="140" height="80" viewBox="0 0 140 80">
        <path
          d="M 14 76 A 56 56 0 0 1 126 76"
          fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="12" strokeLinecap="round"
        />
        <path
          d="M 14 76 A 56 56 0 0 1 126 76"
          fill="none"
          stroke={arcColor}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
          style={{ filter: `drop-shadow(0 0 6px ${arcColor})`, transition: "stroke-dasharray 1s ease" }}
        />
        <text x="70" y="68" textAnchor="middle" fontSize="26" fontWeight="800" fill={arcColor}>{score}</text>
      </svg>
      <div className="text-center space-y-0.5">
        <p className={`text-sm font-bold ${color}`}>{label}</p>
        <p className="text-xs text-muted-foreground">Sales Health Score</p>
      </div>
    </div>
  );
}

// ── Stage Intelligence ────────────────────────────────────────────────────────
// Per-stage config that controls thresholds, penalty weights, text, and extras.
type StageKey = "principiante" | "micro" | "pequena" | "mediana" | "grande";

function resolveStage(businessStage: string): StageKey {
  const s = (businessStage || "").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (/principiante|beginner|starter/.test(s)) return "principiante";
  if (/peque[ñn]|small/.test(s))              return "pequena";
  if (/mediana|medium/.test(s))               return "mediana";
  if (/grande|large|corp|enterprise/.test(s)) return "grande";
  return "micro";
}

// Conversion thresholds: [critical_max %, high_max %, medium_max %]
const CONV_THRESHOLDS: Record<StageKey, [number, number, number]> = {
  principiante: [3,  8,  15],
  micro:        [5,  10, 18],
  pequena:      [8,  15, 22],
  mediana:      [12, 20, 28],
  grande:       [15, 25, 35],
};

// Penalty weight multipliers per factor per stage.
// Same form input → different score depending on what matters most for that stage.
const STAGE_WEIGHTS: Record<StageKey, Record<string, number>> = {
  //                 conv  resp  seg   oferta cont  traf
  principiante: { conv:1.0, resp:0.7, seg:0.5, oferta:1.8, cont:1.5, traf:0.4 },
  micro:        { conv:1.0, resp:1.3, seg:1.2, oferta:1.0, cont:1.1, traf:0.8 },
  pequena:      { conv:1.2, resp:1.0, seg:1.4, oferta:1.0, cont:1.0, traf:1.0 },
  mediana:      { conv:1.3, resp:0.9, seg:1.6, oferta:0.8, cont:0.9, traf:1.2 },
  grande:       { conv:1.5, resp:0.7, seg:1.3, oferta:0.7, cont:0.7, traf:1.6 },
};

// Per-stage bottleneck text for each factor
type BotText = { label: string; description: string; action: string };

function convText(stage: StageKey, cr: string, niche: string, product: string, sev: "critical"|"high"|"medium"): BotText {
  const pr = product || "tu oferta";
  const n  = niche || "tu negocio";
  const map: Record<StageKey, Record<"critical"|"high"|"medium", BotText>> = {
    principiante: {
      critical: { label:"Oferta no validada con clientes reales", description:`Solo ${cr}% de leads convierten. Al inicio, esto casi siempre indica que la oferta no está clara o no está siendo comunicada de forma que genere confianza suficiente para la primera compra. No es un problema de leads — es un problema de validación.`, action:`Habla con 5 prospectos esta semana y pregunta directamente: ¿qué les genera dudas antes de comprar? Usa esas respuestas para redefinir el mensaje de ${pr}. Tu primer objetivo es validación, no volumen.` },
      high:     { label:"Cierre sin confianza establecida", description:`${cr}% de conversión indica que los prospectos están llegando a la conversación de venta antes de tener suficiente confianza en ${n}. Esto es normal al inicio, pero necesitas corregirlo para conseguir los primeros clientes de forma consistente.`, action:`Agrega 2-3 casos de resultado concreto (pueden ser testimonios de personas cercanas o resultados propios). Publica contenido que muestre el proceso real de cómo funciona ${pr} antes de la conversación de venta.` },
      medium:   { label:"Tasa de conversión por debajo del potencial", description:`${cr}% es un punto de partida. Para un negocio principiante, el objetivo es llegar a 15-20% de conversión una vez que la oferta esté clara. Tienes margen concreto de mejora en la forma en que presentas ${pr}.`, action:`Define con precisión el resultado que el cliente obtiene al comprar ${pr}: en qué tiempo, con qué garantía y qué pasa si no funciona. Mientras más claro sea el resultado prometido, más alta será la conversión.` },
    },
    micro: {
      critical: { label:"Tasa de cierre que no sostiene el negocio", description:`${cr}% de conversión con tu volumen de leads significa que estás perdiendo clientes locales que podrían haber comprado hoy. En un negocio local, perder un cliente potencial a la competencia tiene costo doble: pierdes la venta y la referencia.`, action:`Implementa un guión de primera respuesta por WhatsApp que caliente al lead antes de intentar cerrar. Pregunta qué necesitan, cuándo lo necesitan y qué los frenó antes de contactarte. Ese contexto triplica la tasa de cierre.` },
      high:     { label:"Conversión por debajo del mínimo local", description:`${cr}% en un negocio local indica que o bien los leads no son calificados o bien el proceso de venta no está estructurado. En mercados locales, la tasa mínima aceptable es 12-15%.`, action:`Define claramente quién es tu cliente ideal para ${pr} y ajusta el mensaje de captación para atraer solo a ese perfil. Un lead más calificado convierte 3× más sin cambiar el proceso de venta.` },
      medium:   { label:"Margen de mejora en conversión local", description:`${cr}% es funcional pero por debajo del benchmark de microempresas locales eficientes (20-25%). Cada punto porcentual de mejora es una venta adicional sin agregar leads.`, action:`Agrega una garantía visible o una oferta de primera compra con riesgo reducido para ${pr}. En mercados locales, la garantía de satisfacción elimina la principal objeción de compra.` },
    },
    pequena: {
      critical: { label:"Proceso de venta no repetible", description:`${cr}% de conversión indica que el cierre depende de factores aleatorios, no de un sistema. Una pequeña empresa no puede escalar si cada venta requiere esfuerzo heroico o depende de quién atiende al lead.`, action:`Documenta los 5 pasos exactos desde el primer contacto hasta el cierre de ${pr}. Identifica en cuál paso se pierden más leads y corrige específicamente ese punto antes de optimizar los demás.` },
      high:     { label:"Sistema de cierre sin estandarizar", description:`${cr}% de conversión por debajo del benchmark (20%) indica que no hay un proceso de venta estandarizado. Cada vendedor o el dueño cierra de forma diferente, lo que hace imposible mejorar el resultado de forma sistemática.`, action:`Crea un script de venta estándar de 3 etapas: (1) diagnóstico de necesidad, (2) presentación de ${pr} con resultado específico, (3) cierre con opción de decisión inmediata. Úsalo en todas las conversaciones.` },
      medium:   { label:"Conversión sin optimización sistemática", description:`${cr}% está cerca del benchmark pero sin un proceso documentado no podrás mejorarlo de forma predecible. El próximo salto requiere conocer exactamente dónde se rompe el proceso de venta.`, action:`Implementa un seguimiento de etapas en tu CRM. Identifica cuántos leads llegan a cada etapa del proceso de venta de ${pr} y calcula la tasa de conversión entre etapas. El cuello de botella estará en la etapa con mayor caída.` },
    },
    mediana: {
      critical: { label:"Conversión de equipo en niveles de alarma", description:`${cr}% de conversión con un equipo de ventas indica que tus vendedores están invirtiendo tiempo en leads no calificados o en el momento incorrecto del proceso. A escala de equipo, cada punto de conversión perdido se multiplica por el número de vendedores.`, action:`Audita el pipeline de ventas de ${pr}: ¿en qué etapa se pierden más leads? Implementa calificación obligatoria antes de que cualquier lead llegue a un vendedor. Establece un SLA de seguimiento por etapa.` },
      high:     { label:"Rendimiento de equipo por debajo del benchmark", description:`${cr}% de conversión con equipo propio indica que no hay un proceso de ventas estandarizado que todos los vendedores sigan. Sin estándar, no hay forma de mejorar el rendimiento colectivo.`, action:`Establece métricas individuales por vendedor: tasa de contacto, tasa de avance por etapa y tasa de cierre. Identifica al vendedor con mejor conversión y usa su proceso como estándar para el equipo.` },
      medium:   { label:"Margen de optimización de equipo disponible", description:`${cr}% con equipo de ventas tiene margen de mejora sin contratar más personas. En equipos eficientes, la optimización del proceso genera más resultado que agregar headcount.`, action:`Implementa revisiones semanales de pipeline con el equipo: ¿qué leads están en riesgo? ¿qué objeciones se repiten más? Usa esa información para actualizar el script de venta de ${pr} cada 30 días.` },
    },
    grande: {
      critical: { label:"Tasa de cierre corporativa en nivel crítico", description:`${cr}% a nivel corporativo indica fricción sistémica en el pipeline que se amplifica con el volumen. Con el tamaño de tu operación, cada punto de mejora en conversión representa impacto significativo en ingresos.`, action:`Realiza una auditoría de pipeline por segmento: ¿cuál tipo de cliente convierte más? ¿cuál canal genera leads con mayor tasa de cierre? Usa esa segmentación para re-asignar recursos del equipo hacia los segmentos de mayor ROI.` },
      high:     { label:"Conversión corporativa por debajo del estándar", description:`${cr}% de conversión en una empresa grande indica desalineación entre marketing, ventas y el perfil del lead ideal. El problema generalmente no está en el equipo de ventas sino en la calidad de los leads que reciben.`, action:`Establece un SLA entre marketing y ventas: definición de lead calificado, tiempo máximo entre captación y primer contacto, y métricas de calidad de lead compartidas. Sin este acuerdo, el gap de conversión continuará.` },
      medium:   { label:"Conversión corporativa con margen estratégico", description:`${cr}% con el volumen de una empresa grande deja margen significativo de optimización. A escala, cada punto de mejora multiplica su impacto en ingresos totales.`, action:`Implementa pruebas A/B en el proceso de venta: propuesta de valor, momento de cierre, estructura de pricing de ${pr}. Con el volumen que manejas, los datos estadísticamente significativos aparecen rápidamente.` },
    },
  };
  return map[stage][sev];
}

function respText(stage: StageKey, sev: "critical"|"high"|"medium"): BotText {
  const map: Record<StageKey, Record<"critical"|"high"|"medium", BotText>> = {
    principiante: {
      critical: { label:"Primera impresión destruida por lentitud", description:`Para conseguir los primeros clientes, la velocidad de respuesta es la primera impresión de seriedad del negocio. Un prospecto que no recibe respuesta en el día asume que el negocio no está activo o no es profesional.`, action:`Configura un mensaje automático de WhatsApp que se envíe al instante cuando alguien contacte: "¡Hola! Recibí tu mensaje. En las próximas [X horas] te respondo con toda la información." Esa sola acción recupera la confianza inicial.` },
      high:     { label:"Respuesta lenta para un negocio que está creciendo", description:`Responder en horas en lugar de minutos hace que el prospecto ya haya evaluado 2-3 opciones de la competencia antes de que tú respondas. Al inicio, la velocidad suple la falta de reputación establecida.`, action:`Establece un horario fijo de atención (ej. 9am-7pm) y responde dentro de ese horario en menos de 30 minutos. Comunica ese horario de forma visible en tu perfil e inicio de conversación.` },
      medium:   { label:"Tiempo de respuesta mejorable", description:`Menos de 1 hora es aceptable pero no óptimo para convertir prospectos que están evaluando opciones en paralelo. Cada minuto de espera reduce la probabilidad de conversión.`, action:`Prepara 3-5 plantillas de respuesta inicial para los casos más comunes. Eso reduce el tiempo de respuesta a segundos sin sacrificar personalización.` },
    },
    micro: {
      critical: { label:"Respuesta lenta en mercado local competitivo", description:`En un mercado local, la velocidad de respuesta es ventaja competitiva directa. Tu competencia en el área responde más rápido y se lleva al cliente antes de que tú inicies la conversación. Más de 24 horas es perder la venta casi con certeza.`, action:`Asigna a alguien la responsabilidad exclusiva de primera respuesta durante horario de atención. Si eres solo tú, configura respuesta automática de WhatsApp Business con información básica y tiempo de respuesta esperado.` },
      high:     { label:"Velocidad de respuesta local deficiente", description:`En negocios locales, leads que no reciben respuesta en la primera hora tienen 60% menos probabilidad de convertir. Tu competencia más pequeña te gana simplemente respondiendo más rápido.`, action:`Configura notificaciones prioritarias para mensajes nuevos de prospectos. Establece la meta de responder en menos de 15 minutos durante horario de atención. Agrega esa promesa de tiempo de respuesta visible en tu perfil.` },
      medium:   { label:"Margen de mejora en velocidad de respuesta", description:`Menos de 1 hora funciona, pero en mercado local la primera respuesta en menos de 5 minutos puede ser tu diferenciador frente a competencia más grande y menos ágil.`, action:`Prepara plantillas de respuesta inicial con información clave (precios, disponibilidad, próximo paso). Responder en segundos con información completa elimina la necesidad de que el prospecto busque otras opciones.` },
    },
    pequena: {
      critical: { label:"Proceso de captación sin respuesta inmediata", description:`Una pequeña empresa con un sistema de ventas debería tener automatizado el proceso de primera respuesta. Si no lo está, el sistema de captación no está completo y estás perdiendo leads que ya pagaste capturar.`, action:`Implementa respuesta automática por email o WhatsApp que se active inmediatamente al recibir un lead. El mensaje debe incluir: confirmación de recepción, qué esperar a continuación y un recurso de valor inmediato relacionado con la necesidad del prospecto.` },
      high:     { label:"Captación con fuga de leads por lentitud", description:`Con un sistema de ventas en construcción, tener respuesta lenta significa que el proceso de captación está funcionando pero el proceso de conversión tiene una fuga en la primera etapa.`, action:`Implementa una secuencia automática de bienvenida de 3 mensajes: (1) confirmación inmediata, (2) recurso de valor a las 2 horas, (3) invitación a conversación a las 24 horas. Esa secuencia convierte prospectos fríos en calificados sin esfuerzo manual.` },
      medium:   { label:"Primera etapa del funnel sin automatizar", description:`Tienes proceso de venta pero la primera etapa no está automatizada. Eso genera inconsistencia: algunos prospectos reciben buena atención y otros no, dependiendo de la carga de trabajo del momento.`, action:`Automatiza la primera respuesta con un mensaje de calificación que incluya 2-3 preguntas clave sobre la necesidad del prospecto. Eso filtra leads antes de que alguien del equipo invierta tiempo en ellos.` },
    },
    mediana: {
      critical: { label:"SLA de respuesta del equipo incumplido", description:`Tu equipo de ventas tiene un estándar de respuesta que no está siendo cumplido. Más de 24 horas de espera indica que no hay un SLA definido, no hay herramienta de enrutamiento de leads, o el volumen superó la capacidad del equipo.`, action:`Define un SLA de primera respuesta (menos de 1 hora en horario laboral) y mídelo con tu CRM. Implementa asignación automática de leads por territorio o especialidad. Crea una alerta cuando un lead no ha sido contactado en 30 minutos.` },
      high:     { label:"Proceso de asignación de leads ineficiente", description:`Con un equipo, una respuesta de horas indica que el proceso de asignación de leads es lento o manual. Cada hora de espera reduce la conversión y genera una percepción negativa de la empresa que el vendedor tiene que superar en la primera conversación.`, action:`Automatiza la asignación de leads con tu CRM: define reglas de enrutamiento por origen, zona o producto. El vendedor debe recibir la notificación de un nuevo lead en menos de 5 minutos con el contexto completo del prospecto.` },
      medium:   { label:"Velocidad de respuesta mejorable para el equipo", description:`Menos de 1 hora es aceptable para un equipo de ventas, pero el estándar de alto rendimiento es bajo 15 minutos. Con la infraestructura que tiene una mediana empresa, esto debería estar automatizado.`, action:`Implementa respuesta automática inteligente que personalice el primer mensaje basado en el origen y el perfil del lead. Eso elimina la dependencia del vendedor para la primera impresión y reduce el tiempo de respuesta a segundos.` },
    },
    grande: {
      critical: { label:"Ausencia de automatización en primera etapa del funnel", description:`A nivel corporativo, más de 24 horas de respuesta indica que no hay automatización en la primera etapa del funnel de ventas. Con el volumen de leads de una empresa grande, la respuesta manual es insostenible y la lentitud destruye el ROI de la inversión en marketing.`, action:`Implementa un sistema de respuesta automática multicanal que active secuencias personalizadas por origen, industria y perfil del lead en los primeros 60 segundos. El equipo de ventas interviene solo en leads calificados por el sistema automático.` },
      high:     { label:"Funnel inicial sin SLA corporativo", description:`Con el volumen y la infraestructura de una empresa grande, una respuesta de horas es un problema de proceso, no de capacidad. Indica que no existe un SLA formal de primera respuesta ni herramientas de automatización en la primera etapa del funnel.`, action:`Define e implementa un SLA corporativo de primera respuesta: tiempo máximo, canal preferido por segmento, contenido del mensaje inicial. Integra el seguimiento de este SLA en el dashboard ejecutivo de ventas.` },
      medium:   { label:"Automatización de primera respuesta incompleta", description:`Una empresa de tu escala debería tener la primera respuesta completamente automatizada y personalizada. Menos de 1 hora es aceptable pero indica que hay dependencia humana en una etapa que debería ser 100% automática.`, action:`Revisa la automatización de la primera etapa del funnel: ¿se personaliza el mensaje inicial por segmento? ¿se califica automáticamente al lead antes del primer contacto humano? ¿se mide el tiempo de respuesta por canal en el dashboard ejecutivo?` },
    },
  };
  return map[stage][sev];
}

function segText(stage: StageKey, nivel: "ninguno"|"manual"|"crmBasico"): BotText {
  const map: Record<StageKey, Record<"ninguno"|"manual"|"crmBasico", BotText>> = {
    principiante: {
      ninguno:  { label:"Sin seguimiento de primeros prospectos", description:`Al inicio no necesitas un CRM — necesitas un hábito. Sin ningún seguimiento, los prospectos que mostraron interés pero no compraron se pierden para siempre. Ese grupo es tu oportunidad más fácil de primeras ventas.`, action:`Crea una lista simple en WhatsApp o una hoja de Google con: nombre, fecha de contacto, qué dijo y cuándo hacer seguimiento. Revísala cada 3 días. Ese sistema básico puede recuperar 20-30% de prospectos que ya mostraron interés.` },
      manual:   { label:"Seguimiento inconsistente de primeros contactos", description:`El seguimiento manual depende de tu memoria y tu energía del día. Al inicio eso puede funcionar, pero si tienes más de 10 prospectos activos, inevitablemente olvidas hacer seguimiento en el momento correcto.`, action:`Estandariza el proceso: cuando alguien contacte pero no compre, añádelo a tu lista con una nota de seguimiento en 3 días. Ese solo sistema, aplicado consistentemente, puede doblar tu tasa de conversión de primeros clientes.` },
      crmBasico:{ label:"CRM no utilizado para generar primeras ventas", description:`Tienes CRM básico, lo que es una ventaja para un negocio principiante. El problema es que probablemente no estás aprovechando la visibilidad que te da sobre quién necesita seguimiento hoy.`, action:`Revisa tu CRM cada mañana y responde: ¿quién no ha tenido contacto en más de 5 días? ¿quién mostró interés pero no compró? Esas dos preguntas, respondidas con acción inmediata, son tu fuente más fácil de primeras ventas.` },
    },
    micro: {
      ninguno:  { label:"Sin sistema de seguimiento en microempresa", description:`Para una microempresa que depende de volumen local, perder leads sin seguimiento es perder dinero en efectivo. El 80% de las ventas ocurren después del 5° contacto — sin sistema, te detienes en el 1° y 2°.`, action:`Implementa una secuencia de 5 pasos en WhatsApp: Día 1 (primer contacto), Día 3 (valor adicional), Día 7 (testimonio de cliente), Día 14 (oferta especial de tiempo limitado), Día 30 (reactivación). Usa etiquetas de WhatsApp Business para organizar cada etapa.` },
      manual:   { label:"Seguimiento manual sin estructura repetible", description:`El seguimiento manual genera inconsistencia: algunos días haces seguimiento, otros no. Eso hace imposible saber qué funciona y qué no, y te impide escalar el proceso sin agregar más tiempo personal.`, action:`Migra a un CRM básico gratuito (HubSpot Free o Pipedrive gratis). El objetivo inicial no es automatización — es visibilidad. Saber exactamente en qué etapa está cada lead es el primer paso para mejorar la conversión.` },
      crmBasico:{ label:"CRM básico sin automatización de seguimiento", description:`Tienes CRM básico, lo que ya te pone por delante de la mayoría de microempresas. El siguiente paso es agregar automatizaciones que eliminen el seguimiento manual y liberen tu tiempo para cerrar ventas.`, action:`Configura en tu CRM: (1) recordatorio automático cuando un lead no tiene actividad en 5 días, (2) plantilla de mensaje de seguimiento por etapa, (3) alerta cuando un lead calificado no ha sido contactado. Esas 3 automatizaciones duplican la efectividad del seguimiento sin agregar trabajo.` },
    },
    pequena: {
      ninguno:  { label:"Proceso de ventas sin sistema de seguimiento", description:`Una pequeña empresa sin sistema de seguimiento no puede escalar. El crecimiento requiere que el proceso funcione sin depender del dueño ni de la memoria de nadie. Sin sistema, cada vendedor o el dueño opera de forma diferente e impredecible.`, action:`Implementa un CRM básico esta semana (HubSpot o Pipedrive, ambos con plan gratuito funcional). Define las etapas de tu pipeline y migra todos los leads activos. El objetivo inicial es visibilidad, no automatización.` },
      manual:   { label:"Proceso de ventas no estandarizado", description:`El seguimiento manual en una pequeña empresa indica que el proceso de ventas no está documentado ni estandarizado. Eso hace imposible escalar — si el dueño o el mejor vendedor se va, el proceso se cae.`, action:`Documenta el proceso de seguimiento en 5 pasos y cárgalo en un CRM básico. Establece plantillas de mensaje para cada etapa. El proceso debe ser replicable por cualquier persona del equipo, no solo por quien lo creó.` },
      crmBasico:{ label:"CRM básico sin automatización que limite el crecimiento", description:`Con CRM básico sin automatización, tu proceso de ventas escala de forma lineal: más leads = más trabajo manual. Para crecer sin contratar inmediatamente, necesitas que el sistema haga el trabajo repetitivo.`, action:`Agrega 3 automatizaciones básicas: recordatorio de seguimiento por etapa, email o WhatsApp automático ante inactividad de lead, y notificación de leads calificados sin actividad. Esas automatizaciones pueden reducir el trabajo manual de seguimiento en 40-60%.` },
    },
    mediana: {
      ninguno:  { label:"Equipo de ventas sin CRM — visibilidad cero", description:`Con un equipo de ventas, no tener CRM significa que el director comercial opera sin visibilidad de pipeline real. Las decisiones se toman basadas en reportes manuales que siempre son inexactos e incompletos.`, action:`Implementa un CRM inmediatamente (HubSpot, Salesforce o Pipedrive según tu escala). Prioridad #1: visibilidad de pipeline en tiempo real. Prioridad #2: estándar de actualización del CRM por todos los vendedores. Sin esto, ninguna otra optimización funciona.` },
      manual:   { label:"Equipo sin visibilidad de pipeline compartida", description:`Con equipo de ventas y seguimiento manual, cada vendedor opera en silos. El manager no puede ver el pipeline real, los leads caen entre los huecos del proceso y la tasa de conversión varía enormemente entre vendedores.`, action:`Migra a un CRM con visibilidad compartida esta semana. Define el estándar de actualización: qué registrar, cuándo y en qué formato. Establece una reunión semanal de pipeline review donde todos los leads de alta prioridad sean revisados en el sistema.` },
      crmBasico:{ label:"CRM sin automatización limita escala del equipo", description:`Con equipo de ventas y CRM básico sin automatización, tus vendedores invierten tiempo en tareas administrativas que deberían ser automáticas. Eso reduce el tiempo disponible para vender y hace imposible escalar sin contratar.`, action:`Agrega automatizaciones de equipo: asignación automática de leads, secuencia de nurturing automática para leads fríos, alertas de pipeline estancado, y reporte semanal automático de actividad por vendedor. Esas automatizaciones típicamente liberan 30-40% del tiempo de los vendedores.` },
    },
    grande: {
      ninguno:  { label:"Operación corporativa sin CRM — inviable a escala", description:`A nivel corporativo, operar sin CRM hace imposible predecir ingresos, gestionar el equipo de ventas o tomar decisiones basadas en datos reales. El liderazgo opera sin visibilidad y el equipo sin dirección clara.`, action:`Implementa un CRM empresarial (Salesforce, HubSpot Enterprise o similar) con integración a todos los canales de captación. Prioridad inmediata: unificar todos los datos de prospectos en un solo sistema con visibilidad ejecutiva en tiempo real.` },
      manual:   { label:"Proceso de ventas corporativo sin automatización", description:`Con el volumen de una empresa grande y seguimiento manual, hay fugas de leads en cada etapa del proceso que el equipo directivo no puede ver ni medir. El costo de cada lead perdido se multiplica con el volumen.`, action:`Audita el proceso de ventas actual e identifica las 3 etapas con mayor fuga de leads. Automatiza esas 3 etapas primero. Luego establece un dashboard de pipeline en tiempo real accesible para el equipo directivo.` },
      crmBasico:{ label:"Infraestructura de ventas insuficiente para la escala", description:`Un CRM básico es adecuado para microempresas, no para una empresa de tu tamaño. Sin automatización avanzada, integraciones y reportería ejecutiva, estás operando con herramientas que limitan tu capacidad de escalar el equipo y optimizar el proceso.`, action:`Migra a un CRM empresarial con: automatización avanzada de nurturing, integración con marketing y servicio al cliente, reportería ejecutiva en tiempo real, y predicción de ingresos basada en datos de pipeline. Evalúa Salesforce, HubSpot Enterprise o Microsoft Dynamics según tu infraestructura actual.` },
    },
  };
  return map[stage][nivel];
}

function ofertaText(stage: StageKey): BotText {
  const map: Record<StageKey, BotText> = {
    principiante: { label:"Oferta no validada — obstáculo para primeros clientes", description:`Para conseguir los primeros clientes, la claridad de la oferta es el factor más crítico. Si el prospecto no entiende exactamente qué recibe, qué resultado tendrá y por qué debería confiar en ti, no compra. El primer trabajo de un negocio principiante es tener una oferta que se entienda en 10 segundos.`, action:`Define tu oferta con esta estructura: "Ayudo a [tipo de cliente] a lograr [resultado específico] en [tiempo concreto] sin [obstáculo principal]." Prueba ese mensaje con 5 personas de tu audiencia objetivo. Si no lo entienden inmediatamente, sigue simplificando.` },
    micro:        { label:"Oferta confusa frente a competencia local clara", description:`En un mercado local donde los clientes comparan opciones rápido, una oferta confusa pierde frente a una competencia con comunicación más clara — aunque el producto sea inferior. La claridad de oferta es ventaja competitiva directa en mercados locales.`, action:`Compara tu oferta con la de tus 3 principales competidores locales. Identifica qué los diferencia y agrega esa diferencia a tu mensaje principal. En mercados locales, la especialización ("el único [servicio] para [perfil específico] en [zona]") genera conversión inmediata.` },
    pequena:      { label:"Oferta variable — proceso de ventas inconsistente", description:`Una oferta sin claridad estandarizada hace imposible que el equipo venda con consistencia. Si cada vendedor presenta el producto de forma diferente, no puedes tener un proceso de ventas repetible ni medir qué funciona.`, action:`Crea el documento de "oferta oficial" con: qué incluye, qué resultado genera, en qué tiempo, con qué garantía y a qué precio. Todos los vendedores usan la misma versión. Eso estandariza la conversación de venta y permite optimizarla con datos reales.` },
    mediana:      { label:"Oferta del equipo de ventas sin estandarizar", description:`Con un equipo de ventas, la oferta debe estar estandarizada y ser presentable de forma consistente por todos los vendedores. Sin esto, cada vendedor inventa su propia versión, lo que genera inconsistencia en la experiencia del cliente y hace imposible optimizar el proceso.`, action:`Desarrolla un playbook de ventas que incluya: presentación estándar de la oferta, manejo de las 5 objeciones más comunes, y script de cierre. Certifica a todos los vendedores en ese playbook y revísalo cada 90 días basado en datos de conversión por vendedor.` },
    grande:       { label:"Desalineación de oferta entre marketing y ventas", description:`A nivel corporativo, una oferta sin estandarización genera inconsistencia entre lo que marketing promete y lo que ventas presenta. Esa brecha genera fricción con el cliente, aumenta el tiempo de cierre y reduce la tasa de conversión de leads que ya pagaste capturar.`, action:`Realiza un ejercicio de alineación entre los equipos de marketing, ventas y producto: ¿qué promete marketing? ¿qué presenta ventas? ¿qué entrega el producto? Las 3 respuestas deben ser idénticas. Documenta esa alineación y establece un proceso de revisión trimestral.` },
  };
  return map[stage];
}

function contenidoText(stage: StageKey): BotText {
  const map: Record<StageKey, BotText> = {
    principiante: { label:"Sin contenido para generar confianza inicial", description:`El contenido es la forma más económica de generar confianza para conseguir los primeros clientes. Sin contenido visible, cada prospecto entra completamente frío a la conversación de venta — y convencer a alguien frío sin pruebas ni referencias es casi imposible al inicio.`, action:`Publica 3 piezas de contenido esta semana: (1) por qué decidiste empezar este negocio, (2) un proceso o resultado concreto que puedes mostrar, (3) qué hace diferente tu oferta. No necesita ser perfecto — necesita ser real y consistente.` },
    micro:        { label:"Sin visibilidad local por falta de contenido", description:`Para una microempresa, el contenido local y constante genera reconocimiento en la zona sin pagar publicidad. Sin contenido, tu negocio es invisible para prospectos que todavía no te conocen y dependes 100% del boca a boca.`, action:`Publica 3 veces por semana en Instagram o TikTok con contenido específicamente local: resultados de clientes de la zona, el proceso detrás del servicio, y comparaciones directas con lo que el cliente obtiene. Usa el Content Planner de VYRON para generar el calendario de 30 días.` },
    pequena:      { label:"Sin sistema de contenido para nutrir leads", description:`Una pequeña empresa sin calendario de contenido está dejando que su posicionamiento dependa de referencia boca a boca — que no escala. El contenido constante es lo que permite nutrir leads fríos entre el primer contacto y el cierre.`, action:`Implementa un calendario de contenido de 4 semanas con 3 publicaciones semanales. Cada pieza debe cumplir una función: educación, prueba social, o conversión. Asigna un responsable específico para la producción y publicación. Usa el Content Planner de VYRON para generarlo.` },
    mediana:      { label:"Equipo de ventas sin material de nurturing", description:`Sin contenido constante y estratégico, tu equipo de ventas no tiene material para nutrir leads en el proceso de seguimiento. Los vendedores que intentan hacer seguimiento sin contenido de valor tienen que inventar razones para contactar — lo que genera presión y baja conversión.`, action:`Desarrolla una biblioteca de contenido de ventas: casos de éxito, comparativas, guías de resultado y testimonios en video. Los vendedores usan ese material en cada etapa del proceso de seguimiento. Coordina con el equipo de marketing para que el contenido que publican sirva directamente al proceso de ventas.` },
    grande:       { label:"Estrategia de contenido descoordinada con ventas", description:`A nivel corporativo, la ausencia de contenido constante o coordinado indica que no hay estrategia de marketing de contenidos integrada con el equipo de ventas. Eso genera una brecha donde marketing produce contenido que ventas no usa, y ventas hace seguimiento sin material de valor que soporte el proceso.`, action:`Implementa un Content Council entre marketing y ventas: revisión mensual de qué contenido está generando leads calificados, qué material de ventas está mejorando la conversión, y qué preguntas del equipo de ventas deberían convertirse en contenido. Esa alineación típicamente mejora la conversión en 15-25%.` },
  };
  return map[stage];
}

function traficoText(stage: StageKey, canal: string): BotText {
  const map: Record<StageKey, BotText> = {
    principiante: { label:`Canal único (${canal}) sin diversificación`, description:`Al inicio, concentrarse en un solo canal es normal. Lo que importa es que ese canal esté generando leads calificados, no solo seguidores o visitas. Si ${canal} no está trayendo prospectos que realmente quieran comprar, necesitas ajustar el mensaje antes de diversificar.`, action:`Evalúa la calidad de los leads que viene de ${canal}: ¿cuántos tienen el perfil de tu cliente ideal? Si la calidad es baja, ajusta el contenido y el call-to-action antes de abrir un segundo canal. Calidad de lead supera siempre a cantidad.` },
    micro:        { label:`Dependencia de ${canal} en mercado local`, description:`Para una microempresa local, depender de un solo canal es riesgoso. Un cambio de algoritmo en ${canal}, un aumento de costos o una baja temporal de alcance puede eliminar tu fuente de clientes de un día para otro sin opción de recuperación rápida.`, action:`Agrega un segundo canal de adquisición complementario a ${canal}. Si es orgánico, agrega WhatsApp como canal directo de referidos. Si es pagado, complementa con contenido orgánico local. El objetivo es que si ${canal} falla esta semana, no pierdas todos tus leads.` },
    pequena:      { label:`Pipeline de ventas con fuente única (${canal})`, description:`Una pequeña empresa con sistemas debe tener al menos 2 canales de adquisición activos. La redundancia de tráfico es parte de la resiliencia del proceso de ventas. Depender de ${canal} hace tu pipeline frágil frente a cambios externos que no controlas.`, action:`Identifica el segundo canal de mayor ROI para tu tipo de negocio y agrega un proceso de captación específico para ese canal. Establece métricas por canal: costo por lead, tasa de conversión, valor de cliente por origen. Esos datos guiarán la inversión entre canales.` },
    mediana:      { label:`Estrategia de adquisición con canal único (${canal})`, description:`Con un equipo de marketing y ventas, depender de ${canal} como fuente principal de leads indica que no hay una estrategia de diversificación activa. Eso limita la capacidad de escalar sin aumentar la dependencia de ese canal y su costo por lead.`, action:`Desarrolla una estrategia de adquisición multicanal con responsables por canal. Agrega al menos un canal de outbound (email, LinkedIn o eventos) para complementar el inbound de ${canal}. Mide el costo por lead calificado por canal y reasigna presupuesto basado en rendimiento.` },
    grande:       { label:`Atribución imposible con canal único (${canal})`, description:`A nivel corporativo, la dependencia de ${canal} como fuente principal indica ausencia de estrategia multicanal y de sistema de atribución. Sin múltiples canales medidos, es imposible optimizar la inversión de marketing y el equipo directivo no puede tomar decisiones de presupuesto basadas en datos reales.`, action:`Implementa una estrategia de marketing multicanal con atribución correcta: al menos 3 canales activos (paid, orgánico y outbound), sistema de UTM o atribución avanzada, y dashboard ejecutivo con ROI por canal. Esa visibilidad permite reasignar presupuesto hacia los canales de mayor rendimiento y reducir la dependencia de ${canal}.` },
  };
  return map[stage];
}

// Stage-specific extra bottlenecks that activate independently of form values
type BotCandidate = {
  id: string; label: string; description: string;
  impact: number; severity: "critical"|"high"|"medium"|"low";
  penaltyPts: number; action: string;
};

function stageExtraBots(
  stage: StageKey, niche: string, product: string,
  convRate: number, ingresos: number,
  oferta: YesNo, contenido: YesNo, seguimiento: FollowUp, trafico: TrafficSource,
): BotCandidate[] {
  const extras: BotCandidate[] = [];

  if (stage === "principiante") {
    // If offer exists but conversion is very low → presentation gap
    if (oferta === "si" && convRate < 5) {
      extras.push({ id:"pres_gap", label:"Oferta clara pero no convincente en la conversación", description:`Tienes una oferta definida pero la tasa de conversión indica que la presentación en la conversación de venta no está transmitiendo el valor correctamente. Tener la oferta no es suficiente — necesitas el mensaje de venta que la respalde.`, impact:-15, severity:"high", penaltyPts:14, action:`Graba o escribe cómo presentas tu oferta actualmente y revisala: ¿queda claro el resultado específico que el cliente obtiene? ¿el precio está justificado con el valor entregado? Ajusta esos dos elementos primero.` });
    }
    // Trust gap — no content and no established niche
    if (contenido === "no" && oferta === "no") {
      extras.push({ id:"trust_gap", label:"Brecha de confianza — sin prueba social ni contenido", description:`Sin contenido visible ni oferta clara, los prospectos no tienen ninguna señal de confianza antes de la conversación. Eso hace que cada conversación de venta empiece desde cero, sin contexto y sin credibilidad establecida.`, impact:-18, severity:"critical", penaltyPts:16, action:`Tu primera prioridad es generar 3 señales de confianza visibles esta semana: (1) publica cómo funciona tu proceso, (2) comparte un resultado concreto (tuyo o de alguien que hayas ayudado), (3) define y comunica claramente tu oferta. Esas 3 acciones transforman la primera impresión.` });
    }
  }

  if (stage === "mediana") {
    // CRM not advanced = team without pipeline visibility
    if (seguimiento !== "crmAvanzado") {
      extras.push({ id:"pipeline_vis", label:"Equipo directivo sin visibilidad de pipeline real", description:`Con un equipo de ventas y sin CRM avanzado, el director comercial toma decisiones basadas en reportes manuales que siempre son inexactos. Eso hace imposible predecir ingresos, identificar cuellos de botella del equipo o hacer coaching basado en datos.`, impact:-18, severity:"high", penaltyPts:16, action:`Implementa un CRM avanzado con dashboard de pipeline en tiempo real. El director comercial debe poder responder estas preguntas en menos de 1 minuto: ¿cuántos deals activos hay? ¿cuál es el valor total del pipeline? ¿qué deals están en riesgo esta semana? Sin ese acceso, no hay gestión real del equipo.` });
    }
  }

  if (stage === "grande") {
    // Attribution gap — single channel = no attribution
    if (trafico !== "Mixto") {
      extras.push({ id:"attribution", label:"Sistema de atribución indefinido a escala corporativa", description:`Con dependencia de un solo canal, el equipo directivo no puede medir el ROI real de la inversión en marketing ni tomar decisiones de asignación de presupuesto basadas en datos. A escala corporativa, la ausencia de atribución cuesta millones en inversión mal dirigida.`, impact:-20, severity:"critical", penaltyPts:18, action:`Implementa un sistema de atribución multicanal: UTM en todos los canales de captación, integración entre CRM y herramienta de analytics, y dashboard ejecutivo con costo por lead calificado, costo por venta y LTV por canal de origen. Revisa ese dashboard en todas las reuniones de liderazgo comercial.` });
    }
    // Department coordination gap
    if (contenido === "no" || seguimiento !== "crmAvanzado") {
      extras.push({ id:"dept_coord", label:"Descoordinación entre departamentos de ventas y marketing", description:`La ausencia de contenido constante y/o la falta de CRM avanzado en una empresa grande indica desalineación entre los departamentos de marketing, ventas y operaciones. Esa descoordinación genera experiencias de cliente inconsistentes y hace imposible escalar con eficiencia operativa.`, impact:-16, severity:"high", penaltyPts:14, action:`Establece reuniones mensuales de alineación entre líderes de marketing, ventas y operaciones con agenda fija: ¿qué leads están llegando? ¿con qué mensaje? ¿cómo los está atendiendo ventas? ¿qué está entregando operaciones? Esa alineación elimina los silos que generan fricción con el cliente.` });
    }
  }

  return extras;
}

// Stage-specific opportunity text
function opportunityText(
  stage: StageKey, niche: string, product: string,
  botCount: number, minR: number, maxR: number,
  potRev: number, convRate: number, lostSales: number,
): string {
  const pr = product || "tu oferta";
  const n  = niche || "tu negocio";
  const pot = potRev > 0 ? ` — potencial de +$${potRev.toLocaleString()} adicionales por mes` : "";

  if (botCount === 0) {
    const noBot: Record<StageKey, string> = {
      principiante: `Tu proceso inicial está bien configurado para las primeras etapas. El siguiente paso es conseguir los primeros 5-10 clientes activos para validar la oferta con datos reales y construir los primeros testimonios.`,
      micro:        `Tu operación local está funcionando a buen nivel. El siguiente paso de mayor impacto es aumentar el volumen de leads mediante referidos activos y mayor visibilidad local.`,
      pequena:      `Tienes un proceso de ventas sólido. El siguiente paso es documentarlo completamente y prepararlo para delegar — eso liberará tiempo del dueño para enfocarse en crecimiento.`,
      mediana:      `Tu equipo está operando por encima del promedio. El siguiente paso es escalar el volumen de leads manteniendo la conversión actual y agregar un canal de outbound.`,
      grande:       `Tu operación comercial está bien calibrada para la escala actual. El siguiente paso es optimizar la rentabilidad por canal y preparar la infraestructura para el siguiente nivel de crecimiento.`,
    };
    return noBot[stage];
  }

  const stageOpp: Record<StageKey, string> = {
    principiante: `Corrigiendo ${botCount === 1 ? "este cuello de botella" : `estos ${botCount} cuellos de botella"` }, tu negocio podría conseguir los primeros clientes consistentes y establecer la base de confianza necesaria para escalar. El foco inicial no es volumen — es validar la oferta y conseguir los primeros testimonios reales${pot}.`,
    micro:        `Con estas correcciones, tu microempresa podría aumentar su conversión local entre ${minR}% y ${maxR}%, lo que con tu volumen de leads actual representa clientes adicionales cada semana sin aumentar el gasto en captación${pot}.`,
    pequena:      `Implementando estos cambios, tu negocio podría construir un proceso de ventas repetible que funcione sin depender del dueño y que genere entre ${minR}% y ${maxR}% más ingresos del mismo volumen de leads${pot}.`,
    mediana:      `Con estas optimizaciones, tu equipo podría mejorar su tasa de conversión entre ${minR}% y ${maxR}%, lo que con tu volumen actual representa un incremento significativo de ingresos sin contratar vendedores adicionales${pot}.`,
    grande:       `Corrigiendo estos ${botCount} puntos de fricción, tu operación corporativa podría recuperar entre ${minR}% y ${maxR}% de rentabilidad operativa que actualmente se pierde en el proceso${pot}. A escala corporativa, esa mejora tiene impacto directo en los indicadores ejecutivos.`,
  };
  return stageOpp[stage];
}

// ── Diagnostic engine ─────────────────────────────────────────────────────────
function runDiagnostic(
  niche: string,
  product: string,
  precioPromedio: number,
  leads: number,
  ventas: number,
  trafico: TrafficSource,
  respuesta: ResponseTime,
  seguimiento: FollowUp,
  contenido: YesNo,
  oferta: YesNo,
  businessStage: string,
): DiagnosticResult {
  const stage    = resolveStage(businessStage);
  const w        = STAGE_WEIGHTS[stage];
  const [crit, high, med] = CONV_THRESHOLDS[stage];

  const convRate  = leads > 0 ? (ventas / leads) * 100 : 0;
  const lostSales = Math.max(0, leads - ventas);
  const ingresos  = ventas * precioPromedio;

  const candidates: BotCandidate[] = [];

  // 1. Tasa de conversión — thresholds and text differ per stage
  if (convRate < crit) {
    const t = convText(stage, convRate.toFixed(1), niche, product, "critical");
    candidates.push({ id:"conv", ...t, impact:-28, severity:"critical", penaltyPts: Math.round(28 * w.conv) });
  } else if (convRate < high) {
    const t = convText(stage, convRate.toFixed(1), niche, product, "high");
    candidates.push({ id:"conv", ...t, impact:-18, severity:"high", penaltyPts: Math.round(18 * w.conv) });
  } else if (convRate < med) {
    const t = convText(stage, convRate.toFixed(1), niche, product, "medium");
    candidates.push({ id:"conv", ...t, impact:-10, severity:"medium", penaltyPts: Math.round(10 * w.conv) });
  }

  // 2. Tiempo de respuesta — weighted per stage
  if (respuesta === "mas24h") {
    const t = respText(stage, "critical");
    candidates.push({ id:"respuesta", ...t, impact:-30, severity:"critical", penaltyPts: Math.round(25 * w.resp) });
  } else if (respuesta === "menos24h") {
    const t = respText(stage, "high");
    candidates.push({ id:"respuesta", ...t, impact:-22, severity:"high", penaltyPts: Math.round(18 * w.resp) });
  } else if (respuesta === "menos1h") {
    const t = respText(stage, "medium");
    candidates.push({ id:"respuesta", ...t, impact:-8, severity:"medium", penaltyPts: Math.round(8 * w.resp) });
  }

  // 3. Sistema de seguimiento — weighted per stage
  if (seguimiento === "ninguno") {
    const t = segText(stage, "ninguno");
    candidates.push({ id:"seguimiento", ...t, impact:-22, severity:"critical", penaltyPts: Math.round(22 * w.seg) });
  } else if (seguimiento === "manual") {
    const t = segText(stage, "manual");
    candidates.push({ id:"seguimiento", ...t, impact:-14, severity:"medium", penaltyPts: Math.round(12 * w.seg) });
  } else if (seguimiento === "crmBasico") {
    const t = segText(stage, "crmBasico");
    candidates.push({ id:"seguimiento", ...t, impact:-6, severity:"low", penaltyPts: Math.round(5 * w.seg) });
  }

  // 4. Sin oferta clara — weighted per stage
  if (oferta === "no") {
    const t = ofertaText(stage);
    candidates.push({ id:"oferta", ...t, impact:-16, severity:"high", penaltyPts: Math.round(15 * w.oferta) });
  }

  // 5. Sin contenido constante — weighted per stage
  if (contenido === "no") {
    const t = contenidoText(stage);
    candidates.push({ id:"contenido", ...t, impact:-12, severity:"medium", penaltyPts: Math.round(10 * w.cont) });
  }

  // 6. Tráfico concentrado — weighted per stage
  if (trafico !== "Mixto") {
    const baseImpact = trafico === "TikTok" || trafico === "WhatsApp" ? -10
                     : trafico === "Facebook" || trafico === "Instagram" ? -8 : -5;
    const t = traficoText(stage, trafico);
    const sev: "critical"|"high"|"medium"|"low" =
      Math.abs(baseImpact) >= 10 ? "medium" : "low";
    candidates.push({ id:"trafico", ...t, impact:baseImpact, severity:sev, penaltyPts: Math.round(Math.abs(baseImpact) * w.traf) });
  }

  // 7. Stage-specific extra bottlenecks
  const extras = stageExtraBots(stage, niche, product, convRate, ingresos, oferta, contenido, seguimiento, trafico);
  candidates.push(...extras);

  // ── Sort by penaltyPts descending ─────────────────────────────────────────
  const sorted = [...candidates].sort((a, b) => b.penaltyPts - a.penaltyPts);
  const top3   = sorted.slice(0, 3);

  const bottlenecks: Bottleneck[] = top3.map((b, i) => ({
    rank:        (i + 1) as 1 | 2 | 3,
    label:       b.label,
    description: b.description,
    impact:      b.impact,
    severity:    b.severity,
  }));

  // ── Health Score ────────────────────────────────────────────────────────────
  const totalPenalty = sorted.reduce((acc, c) => acc + c.penaltyPts, 0);
  const score        = Math.round(Math.max(0, Math.min(100, 100 - totalPenalty)));

  const stageScoreLabels: Record<StageKey, (s: number) => string> = {
    principiante: (s) => s >= 75 ? "Listo para primeros clientes" : s >= 50 ? "Oferta en validación" : s >= 30 ? "Necesita claridad antes de vender" : "Base sin construir",
    micro:        (s) => s >= 80 ? "Microempresa Saludable" : s >= 60 ? "Funcionando con Brechas" : s >= 40 ? "Proceso con Fugas de Clientes" : "Sistema de Venta en Crisis",
    pequena:      (s) => s >= 80 ? "Sistema de Ventas Sólido" : s >= 60 ? "Proceso en Construcción" : s >= 40 ? "Sin Sistema Repetible" : "Operación Dependiente del Dueño",
    mediana:      (s) => s >= 80 ? "Equipo de Ventas Optimizado" : s >= 60 ? "Equipo con Brechas de Proceso" : s >= 40 ? "CRM y Automatización Críticos" : "Equipo sin Visibilidad ni Sistema",
    grande:       (s) => s >= 80 ? "Operación Corporativa Eficiente" : s >= 60 ? "Escala con Fricciones Detectadas" : s >= 40 ? "Problemas Sistémicos de Rentabilidad" : "Coordinación Corporativa en Crisis",
  };

  const scoreLabel = stageScoreLabels[stage](score);
  const scoreColor =
    score >= 80 ? "text-green-400" :
    score >= 60 ? "text-primary" :
    score >= 40 ? "text-amber-400" :
                  "text-red-400";

  // ── Action Plan ─────────────────────────────────────────────────────────────
  const actions = top3.map((b, i) => ({
    priority: i + 1,
    title:    b.label,
    text:     b.action,
  }));

  // ── Growth Opportunity ──────────────────────────────────────────────────────
  const maxImpact    = Math.abs(top3.reduce((acc, b) => acc + b.impact, 0));
  const minRecovery  = Math.round(maxImpact * 0.4);
  const maxRecovery  = Math.round(maxImpact * 0.85);
  const potentialRevenue = Math.round(ingresos * (maxRecovery / 100));

  const opportunity = opportunityText(stage, niche, product, top3.length, minRecovery, maxRecovery, potentialRevenue, convRate, lostSales);

  return { score, scoreLabel, scoreColor, bottlenecks, actions, opportunity, convRate, lostSales, potentialRevenue };
}

// ── Option constants ───────────────────────────────────────────────────────────
const TRAFFIC_OPTIONS: { value: TrafficSource; label: string }[] = [
  { value: "Facebook",  label: "Facebook" },
  { value: "Instagram", label: "Instagram" },
  { value: "TikTok",    label: "TikTok" },
  { value: "Google",    label: "Google" },
  { value: "Referidos", label: "Referidos" },
  { value: "WhatsApp",  label: "WhatsApp" },
  { value: "Mixto",     label: "Mixto" },
];

const RESPONSE_OPTIONS: { value: ResponseTime; label: string }[] = [
  { value: "menos5min", label: "Menos de 5 min" },
  { value: "menos1h",   label: "Menos de 1 hora" },
  { value: "menos24h",  label: "Menos de 24 horas" },
  { value: "mas24h",    label: "Más de 24 horas" },
];

const FOLLOWUP_OPTIONS: { value: FollowUp; label: string }[] = [
  { value: "ninguno",     label: "Ninguno" },
  { value: "manual",      label: "Manual" },
  { value: "crmBasico",   label: "CRM Básico" },
  { value: "crmAvanzado", label: "CRM Avanzado" },
];

const YESNO_OPTIONS: { value: YesNo; label: string }[] = [
  { value: "si", label: "Sí" },
  { value: "no", label: "No" },
];

const RANK_LABEL: Record<number, string> = {
  1: "Cuello de Botella Principal",
  2: "Cuello de Botella Secundario",
  3: "Cuello de Botella Terciario",
};

const RANK_ICON: Record<number, React.ReactNode> = {
  1: <CircleDot size={14} className="text-red-400" />,
  2: <CircleDot size={14} className="text-orange-400" />,
  3: <CircleDot size={14} className="text-amber-400" />,
};

// ── Page ───────────────────────────────────────────────────────────────────────
export default function SalesDiagnosticPage() {
  const { language, businessStage } = useVyronSettings();

  const [diagStage,  setDiagStage]  = useState("");

  const [niche,      setNiche]      = useState("");
  const [product,    setProduct]    = useState("");
  const [precio,     setPrecio]     = useState("");
  const [leads,      setLeads]      = useState("");
  const [ventas,     setVentas]     = useState("");
  const [trafico,    setTrafico]    = useState<TrafficSource>("Instagram");
  const [respuesta,  setRespuesta]  = useState<ResponseTime>("menos1h");
  const [seguimiento, setSeguimiento] = useState<FollowUp>("manual");
  const [contenido,  setContenido]  = useState<YesNo>("no");
  const [oferta,     setOferta]     = useState<YesNo>("no");
  const [result,     setResult]     = useState<DiagnosticResult | null>(null);

  const leadsNum  = parseFloat(leads)  || 0;
  const ventasNum = parseFloat(ventas) || 0;
  const precioNum = parseFloat(precio) || 0;

  const ventasExcedeLeads = leads.trim() !== "" && ventas.trim() !== "" && ventasNum > leadsNum;
  const canDiagnose =
    niche.trim()   !== "" &&
    precio.trim()  !== "" && precioNum > 0 &&
    leads.trim()   !== "" && leadsNum  > 0 &&
    ventas.trim()  !== "" && ventasNum >= 0 &&
    !ventasExcedeLeads;

  const handleDiagnose = () => {
    if (!canDiagnose) return;
    const stageSnap = businessStage || "";
    setDiagStage(stageSnap);
    setResult(runDiagnostic(
      niche, product, precioNum, leadsNum, ventasNum,
      trafico, respuesta, seguimiento, contenido, oferta,
      stageSnap,
    ));
    setTimeout(() => {
      document.getElementById("diag-results")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  return (
    <AppLayout title="Sales Diagnostic">
      <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-6">

        {/* Header */}
        <div className="space-y-1">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Activity size={22} className="text-primary" />
            Sales Diagnostic AI
          </h2>
          <p className="text-muted-foreground text-sm">
            Ingresa los datos de tu negocio y obtén un diagnóstico completo de cuellos de botella, impacto estimado y plan de acción priorizado.
          </p>
        </div>

        <BusinessSettings />

        {/* Form */}
        <div className="glass border border-border rounded-xl p-4 md:p-6 space-y-5">

          {/* Niche */}
          <div className="space-y-2">
            <Label htmlFor="niche">Nicho</Label>
            <Input
              id="niche"
              placeholder="ej. Barbería, Consultoría, Fitness…"
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              className="bg-background/50 border-border focus-visible:ring-primary/50"
            />
          </div>

          {/* Product */}
          <div className="space-y-2">
            <Label htmlFor="product">Producto o Servicio</Label>
            <Input
              id="product"
              placeholder="ej. Corte premium, Coaching 1:1, Membresía…"
              value={product}
              onChange={(e) => setProduct(e.target.value)}
              className="bg-background/50 border-border focus-visible:ring-primary/50"
            />
          </div>

          {/* Precio */}
          <div className="space-y-2">
            <Label htmlFor="precio">Precio Promedio ($)</Label>
            <Input
              id="precio"
              type="number"
              min="1"
              placeholder="ej. 150"
              value={precio}
              onChange={(e) => setPrecio(e.target.value)}
              className="bg-background/50 border-border focus-visible:ring-primary/50"
            />
          </div>

          {/* Leads / Ventas */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="leads">Leads por mes</Label>
              <Input
                id="leads"
                type="number"
                min="1"
                placeholder="ej. 80"
                value={leads}
                onChange={(e) => setLeads(e.target.value)}
                className="bg-background/50 border-border focus-visible:ring-primary/50"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ventas" className={ventasExcedeLeads ? "text-red-400" : ""}>
                Ventas por mes
              </Label>
              <Input
                id="ventas"
                type="number"
                min="0"
                placeholder="ej. 12"
                value={ventas}
                onChange={(e) => setVentas(e.target.value)}
                className={
                  ventasExcedeLeads
                    ? "bg-red-500/10 border-red-500 focus-visible:ring-red-500/50 text-red-400"
                    : "bg-background/50 border-border focus-visible:ring-primary/50"
                }
              />
              {ventasExcedeLeads && (
                <div className="flex items-center gap-1.5 text-red-400 text-xs font-medium">
                  <AlertTriangle size={11} />
                  Las ventas no pueden superar los leads.
                </div>
              )}
            </div>
          </div>

          {/* Traffic source */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Fuente principal de tráfico</Label>
            <PillSelector options={TRAFFIC_OPTIONS} value={trafico} onChange={setTrafico} />
          </div>

          {/* Response time */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Tiempo promedio de respuesta</Label>
            <PillSelector options={RESPONSE_OPTIONS} value={respuesta} onChange={setRespuesta} />
          </div>

          {/* Follow-up system */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Sistema de seguimiento</Label>
            <PillSelector options={FOLLOWUP_OPTIONS} value={seguimiento} onChange={setSeguimiento} />
          </div>

          {/* Content + Offer */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Contenido constante</Label>
              <PillSelector options={YESNO_OPTIONS} value={contenido} onChange={setContenido} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Oferta clara</Label>
              <PillSelector options={YESNO_OPTIONS} value={oferta} onChange={setOferta} />
            </div>
          </div>

          <Button
            onClick={handleDiagnose}
            disabled={!canDiagnose}
            className="w-full electric-glow font-semibold"
          >
            <Activity size={16} className="mr-2" />
            Diagnosticar Negocio
          </Button>
        </div>

        {/* ── Results ───────────────────────────────────────────────────────── */}
        {result && (
          <div id="diag-results" className="space-y-3 animate-in fade-in-0 slide-in-from-bottom-4 duration-300">

            {/* ── Stage badge ──────────────────────────────────────────── */}
            {diagStage && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 w-fit">
                <Target size={12} className="text-primary" />
                <span className="text-xs text-primary font-semibold">Diagnóstico para: {diagStage}</span>
              </div>
            )}

            {/* ── Sales Health Score ───────────────────────────────────── */}
            <SectionHeader icon={<BarChart3 size={14} />} label="Sales Health Score" />
            <div className="glass border border-border rounded-xl p-5 flex flex-col items-center gap-2">
              <ScoreGauge score={result.score} label={result.scoreLabel} color={result.scoreColor} />

              {/* Score bar */}
              <div className="w-full max-w-xs space-y-1.5 mt-1">
                <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${result.score}%`,
                      background: result.score >= 80 ? "#22c55e" : result.score >= 60 ? "#6366f1" : result.score >= 40 ? "#f59e0b" : "#ef4444",
                      boxShadow: `0 0 8px ${result.score >= 80 ? "#22c55e" : result.score >= 60 ? "#6366f1" : result.score >= 40 ? "#f59e0b" : "#ef4444"}`,
                    }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>0 — Crisis</span>
                  <span>100 — Óptimo</span>
                </div>
              </div>

              {/* Key metrics row */}
              <div className="w-full grid grid-cols-3 gap-2 mt-3">
                <div className="rounded-lg bg-white/5 border border-border p-3 text-center space-y-1">
                  <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Conversión</p>
                  <p className={`text-lg font-bold ${result.convRate >= 20 ? "text-green-400" : result.convRate >= 10 ? "text-amber-400" : "text-red-400"}`}>
                    {result.convRate.toFixed(1)}%
                  </p>
                </div>
                <div className="rounded-lg bg-white/5 border border-border p-3 text-center space-y-1">
                  <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Leads Perdidos</p>
                  <p className="text-lg font-bold text-red-400">{result.lostSales}</p>
                </div>
                <div className="rounded-lg bg-white/5 border border-border p-3 text-center space-y-1">
                  <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Cuellos</p>
                  <p className="text-lg font-bold text-amber-400">{result.bottlenecks.length}</p>
                </div>
              </div>
            </div>

            {/* ── Bottlenecks ───────────────────────────────────────────── */}
            {result.bottlenecks.length > 0 && (
              <>
                <SectionHeader icon={<TrendingDown size={14} />} label="Cuellos de Botella Detectados" />
                <div className="space-y-3">
                  {result.bottlenecks.map((b) => {
                    const s = SEV[b.severity];
                    return (
                      <div key={b.rank} className={`glass border ${s.border} ${s.bg} rounded-xl p-4 space-y-3`}>
                        {/* Header */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2 min-w-0">
                            {RANK_ICON[b.rank]}
                            <div>
                              <p className={`text-[10px] font-bold uppercase tracking-wider ${s.text}`}>
                                {RANK_LABEL[b.rank]}
                              </p>
                              <p className="text-sm font-bold text-foreground leading-snug mt-0.5">{b.label}</p>
                            </div>
                          </div>
                          <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border ${s.badge}`}>
                            {b.severity === "critical" ? "Crítico" : b.severity === "high" ? "Alto" : b.severity === "medium" ? "Medio" : "Bajo"}
                          </span>
                        </div>
                        {/* Description */}
                        <p className="text-xs text-foreground/80 leading-relaxed">{b.description}</p>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* ── Impacto Estimado ──────────────────────────────────────── */}
            {result.bottlenecks.length > 0 && (
              <>
                <SectionHeader icon={<DollarSign size={14} />} label="Impacto Estimado en Conversión" />
                <div className="glass border border-border rounded-xl p-4 space-y-3">
                  {result.bottlenecks.map((b) => (
                    <div key={b.rank} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-foreground/80 font-medium">{b.label}</span>
                        <span className="font-bold text-red-400">{b.impact}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-red-500/60"
                          style={{ width: `${Math.min(Math.abs(b.impact), 100)}%`, transition: "width 0.7s ease" }}
                        />
                      </div>
                    </div>
                  ))}
                  <p className="text-[10px] text-muted-foreground pt-1">
                    * Impacto estimado en tasa de conversión relativa al estado actual del negocio.
                  </p>
                </div>
              </>
            )}

            {/* ── Plan de Acción ────────────────────────────────────────── */}
            {result.actions.length > 0 && (
              <>
                <SectionHeader icon={<Target size={14} />} label="Plan de Acción" />
                <div className="space-y-3">
                  {result.actions.map((a) => (
                    <div key={a.priority} className="glass border border-primary/25 rounded-xl p-4 space-y-2 bg-primary/5">
                      <div className="flex items-center gap-2">
                        <div className="shrink-0 w-6 h-6 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center">
                          <span className="text-[11px] font-bold text-primary">{a.priority}</span>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-primary uppercase tracking-wider">Prioridad #{a.priority}</p>
                          <p className="text-sm font-bold text-foreground leading-snug">{a.title}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2 pl-8">
                        <ArrowRight size={12} className="text-primary shrink-0 mt-0.5" />
                        <p className="text-xs text-foreground/80 leading-relaxed">{a.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* ── Oportunidad de Crecimiento ─────────────────────────────── */}
            <SectionHeader icon={<TrendingUp size={14} />} label="Oportunidad de Crecimiento" />
            <div className="glass border border-green-500/30 bg-green-500/5 rounded-xl p-5 space-y-3">
              <div className="flex items-start gap-3">
                <Lightbulb size={18} className="text-green-400 shrink-0 mt-0.5" />
                <p className="text-sm text-foreground/90 leading-relaxed font-medium">{result.opportunity}</p>
              </div>
              {result.potentialRevenue > 0 && (
                <div className="flex items-center gap-2 rounded-lg bg-green-500/10 border border-green-500/20 px-4 py-3">
                  <DollarSign size={14} className="text-green-400 shrink-0" />
                  <div>
                    <p className="text-[10px] font-bold text-green-400 uppercase tracking-wider">Potencial recuperable / mes</p>
                    <p className="text-xl font-bold text-green-400">+${result.potentialRevenue.toLocaleString()}</p>
                  </div>
                </div>
              )}
            </div>

            {/* ── No bottlenecks state ──────────────────────────────────── */}
            {result.bottlenecks.length === 0 && (
              <div className="glass border border-green-500/30 bg-green-500/5 rounded-xl p-5 flex items-start gap-3">
                <CheckCircle2 size={20} className="text-green-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-bold text-green-400">Proceso de ventas optimizado</p>
                  <p className="text-xs text-foreground/80 leading-relaxed">
                    Tu negocio tiene un proceso de ventas sólido. El siguiente paso de alto impacto es escalar el volumen de leads manteniendo los sistemas actuales.
                  </p>
                </div>
              </div>
            )}

          </div>
        )}
      </div>
    </AppLayout>
  );
}
