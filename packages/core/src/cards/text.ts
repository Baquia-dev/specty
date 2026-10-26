// SPDX-License-Identifier: Apache-2.0
import { AGENT_NAMES, effortName } from "../agents";
import type { Lang } from "../i18n";
import type { EffortLevel, EffortRecommendation } from "../sizing/effort";
import type { CardContext, ChangeView } from "./view";

export type Translate = (es: string, en: string) => string;

export function translator(lang: Lang): Translate {
  return (es, en) => (lang === "es" ? es : en);
}

const NEUTRAL_EFFORT: Readonly<Record<Lang, Readonly<Record<EffortLevel, string>>>> = {
  es: { low: "bajo", medium: "medio", high: "alto", max: "máximo" },
  en: { low: "low", medium: "medium", high: "high", max: "max" },
};

/** The tool's own name for an effort level, or a neutral word when the tool is unknown. */
export function effortLabel(level: EffortLevel, ctx: CardContext): string {
  return effortName(level, ctx.tool) ?? NEUTRAL_EFFORT[ctx.lang][level];
}

/** Once the spec is written, the planning level is the one for reviewing the spec and its scope. */
export function effortLine(effort: EffortRecommendation, ctx: CardContext): string {
  const t = translator(ctx.lang);
  const tool = ctx.tool === undefined ? "" : ` (${AGENT_NAMES[ctx.tool]})`;
  const reasons = effort.raisedBy?.join("; ") ?? "";
  const raised =
    effort.raisedBy === undefined
      ? ""
      : reasons.length === 0
        ? t(" (el modelo lo sube)", " (raised by the model)")
        : t(` (el modelo lo sube: ${reasons})`, ` (raised by the model: ${reasons})`);
  return t(
    `ESFUERZO RECOMENDADO${tool}: implementación ${effortLabel(effort.implement, ctx)} · revisiones de la spec y del alcance: ${effortLabel(effort.plan, ctx)}${raised}`,
    `RECOMMENDED EFFORT${tool}: implementation ${effortLabel(effort.implement, ctx)} · spec and scope reviews: ${effortLabel(effort.plan, ctx)}${raised}`,
  );
}

/** `tarea 2 de 4` for the active task, counting done tasks. */
export function progressOf(change: ChangeView, lang: Lang): string | undefined {
  const total = change.tasks.length;
  const active = change.tasks.findIndex((task) => task.status === "active");
  if (total === 0 || active === -1) return undefined;
  return translator(lang)(`tarea ${active + 1} de ${total}`, `task ${active + 1} of ${total}`);
}

export function quoted(text: string, lang: Lang): string {
  return lang === "es" ? `«${text}»` : `"${text}"`;
}

/** `ejecuta \`specty next\``: the way on when the flow, not the command, knows what comes now. */
export function runNext(ctx: CardContext): string {
  return translator(ctx.lang)(`ejecuta \`${ctx.command} next\`.`, `run \`${ctx.command} next\`.`);
}

/** Instructions to write or revise a spec, adapted to the kind of change. */
export function draftingGuide(change: ChangeView, ctx: CardContext): string[] {
  const t = translator(ctx.lang);
  const common = [
    t(
      "Si una duda cambia el diseño, pregúntale al usuario antes de escribir (3 preguntas como máximo).",
      "If a doubt changes the design, ask the user before writing (3 questions at most).",
    ),
    t(
      "Escribe lo demás como supuestos; marca con «impacto: alto» los que cambiarían el diseño si fueran falsos.",
      'Write everything else as assumptions; mark with "impact: high" those that would change the design if false.',
    ),
  ];
  const dependencies = t(
    "Si el cambio añade dependencias a un manifiesto, nómbralas en `allowedDependencies` del frontmatter: `specty check --spec` rechaza las demás.",
    "If the change adds dependencies to a manifest, name them in the frontmatter's `allowedDependencies`: `specty check --spec` rejects the rest.",
  );
  switch (change.kind) {
    case "quick":
      return [
        t(
          `Quick: objetivo, archivos (hasta ${ctx.quickMaxFiles}, sin rutas sensibles) y una sola tarea con \`verify\`.`,
          `Quick: goal, files (up to ${ctx.quickMaxFiles}, no sensitive paths) and a single task with \`verify\`.`,
        ),
        dependencies,
      ];
    case "spike":
      return [
        ...common,
        t(
          "Spike: la pregunta, lo que no harás y un prototipo desechable; al cerrar, Hallazgos y Decisión.",
          "Spike: the question, what you will not do and a throwaway prototype; when closing, Findings and Decision.",
        ),
      ];
    case "epic":
      return [
        ...common,
        t(
          "Épica: cortes verticales que funcionen de punta a punta, cada uno con `ac` y `depends`.",
          "Epic: vertical slices that work end to end, each with `ac` and `depends`.",
        ),
      ];
    case "retro":
      return [
        t(
          "Retro: qué cambió (Objetivo), por qué (Motivo) y qué podría romperse (Riesgos).",
          "Retro: what changed (Goal), why (Reason) and what could break (Risks).",
        ),
      ];
    case "standard":
      return [
        ...common,
        t(
          "Fuera de alcance: lo que no harás. Criterios: CUANDO … ENTONCES …, observables.",
          "Out of scope: what you will not do. Criteria: WHEN … THEN …, observable.",
        ),
        t(
          "Archivos: cada ruta que tocarás, con su motivo. Tareas: pequeñas, con `files`, `ac` y `verify`.",
          "Files: every path you will touch, with its reason. Tasks: small, with `files`, `ac` and `verify`.",
        ),
        dependencies,
        t(
          "Borra las secciones opcionales que no uses.",
          "Remove the optional sections you do not use.",
        ),
      ];
  }
}
