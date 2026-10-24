// SPDX-License-Identifier: Apache-2.0
import type { Lang } from "../i18n";
import { type Output, section } from "../output";
import { translator } from "./text";
import type { CardContext } from "./view";

/**
 * The independent review (ADR 0011): what the reviewer reads, and the card that shows its answer.
 * The reviewer has no tools and no context but this text, so it is told not to guess.
 */

const SPEC_INSTRUCTIONS: Readonly<Record<Lang, string>> = {
  es: [
    "Eres un revisor independiente de una spec de software. No tienes herramientas ni más contexto que esta spec: no supongas archivos ni código que no ves.",
    "Busca, de más a menos grave:",
    "- supuestos que probablemente sean falsos o que cambiarían el diseño;",
    "- criterios de aceptación que no se pueden comprobar, o que faltan;",
    "- archivos o tareas que faltan para cumplir los criterios, o que sobran;",
    "- riesgos que la spec no menciona.",
    "Responde en markdown, con una viñeta por hallazgo y su gravedad (alta, media o baja). Si no encuentras nada importante, dilo en una línea.",
  ].join("\n"),
  en: [
    "You are an independent reviewer of a software spec. You have no tools and no context but this spec: do not assume files or code you cannot see.",
    "Look for, from most to least serious:",
    "- assumptions that are likely false or would change the design;",
    "- acceptance criteria that cannot be checked, or that are missing;",
    "- files or tasks missing to meet the criteria, or that are not needed;",
    "- risks the spec does not mention.",
    "Answer in markdown, one bullet per finding with its severity (high, medium or low). If you find nothing important, say so in one line.",
  ].join("\n"),
};

const DIFF_INSTRUCTIONS: Readonly<Record<Lang, string>> = {
  es: [
    "Eres un revisor independiente de un cambio de código. Tienes la spec que lo pidió y su diff; no tienes herramientas ni más contexto: no supongas código que no ves.",
    "Busca, de más a menos grave:",
    "- criterios de aceptación que el diff no cumple, o cumple a medias;",
    "- defectos: errores de lógica, casos que faltan, regresiones;",
    "- problemas de seguridad;",
    "- tests que no comprueban lo que dicen.",
    "Responde en markdown, con una viñeta por hallazgo, su gravedad (alta, media o baja) y el archivo. Si no encuentras nada importante, dilo en una línea.",
  ].join("\n"),
  en: [
    "You are an independent reviewer of a code change. You have the spec that asked for it and its diff; you have no tools and no other context: do not assume code you cannot see.",
    "Look for, from most to least serious:",
    "- acceptance criteria the diff does not meet, or meets halfway;",
    "- defects: logic errors, missing cases, regressions;",
    "- security problems;",
    "- tests that do not check what they claim.",
    "Answer in markdown, one bullet per finding with its severity (high, medium or low) and its file. If you find nothing important, say so in one line.",
  ].join("\n"),
};

/** What the review command reads on its standard input to review a spec. */
export function specReviewPrompt(spec: string, lang: Lang): string {
  return `${SPEC_INSTRUCTIONS[lang]}\n\n<spec>\n${spec.trimEnd()}\n</spec>\n`;
}

/** What the review command reads to review the result: the spec, then the change's diff. */
export function diffReviewPrompt(spec: string, diff: string, lang: Lang): string {
  return `${DIFF_INSTRUCTIONS[lang]}\n\n<spec>\n${spec.trimEnd()}\n</spec>\n\n<diff>\n${diff.trimEnd()}\n</diff>\n`;
}

export interface ReviewedView {
  readonly header: string;
  /** What was reviewed: the spec, before the approval, or the result, before the acceptance. */
  readonly target: "spec" | "diff";
  /** The configured review command. */
  readonly command: string;
  /** Repository-relative path where the answer is kept. */
  readonly path: string;
  readonly text: string;
}

/** The longest answer the card repeats; the file keeps it whole. */
const MAX_LINES = 200;

/** The reviewer's answer, for the agent to act on what is real and tell the user the rest. */
export function reviewedCard(view: ReviewedView, ctx: CardContext): Output {
  const t = translator(ctx.lang);
  const lines = view.text.trimEnd().split("\n");
  const shown = lines.length > MAX_LINES ? [...lines.slice(0, MAX_LINES), "…"] : lines;
  const blocks = section(
    t(`REVISIÓN INDEPENDIENTE (${view.command})`, `INDEPENDENT REVIEW (${view.command})`),
    [t(`Guardada en ${view.path}.`, `Kept in ${view.path}.`), ...shown],
  );
  if (view.target === "diff")
    return { status: "ok", header: view.header, blocks, next: afterResult(ctx) };
  const approve =
    ctx.delegated === true
      ? t(
          `si no hay nada que corregir, aprueba tú con \`${ctx.command} approve\``,
          `if there is nothing to fix, approve it yourself with \`${ctx.command} approve\``,
        )
      : t(
          `si no hay nada que corregir, cuéntale al usuario lo que encontró la revisión y pídele que apruebe con \`${ctx.command} approve\``,
          `if there is nothing to fix, tell the user what the review found and ask them to approve with \`${ctx.command} approve\``,
        );
  return {
    status: "ok",
    header: view.header,
    blocks,
    next: t(
      `corrige en la spec lo que sea un problema real y vuelve a ejecutar \`${ctx.command} propose\`; ${approve}. La revisión es información: decide la persona.`,
      `fix in the spec what is a real problem and run \`${ctx.command} propose\` again; ${approve}. The review is information: the person decides.`,
    ),
  };
}

/** After reviewing the result: the person accepts it or asks for an adjustment. */
function afterResult(ctx: CardContext): string {
  const t = translator(ctx.lang);
  return ctx.delegated === true
    ? t(
        `si la revisión encontró un defecto real, pide el ajuste con \`${ctx.command} adjust "<qué arreglar>"\`; si no, acepta tú con \`${ctx.command} accept\`. La revisión es información.`,
        `if the review found a real defect, ask for the adjustment with \`${ctx.command} adjust "<what to fix>"\`; if not, accept it yourself with \`${ctx.command} accept\`. The review is information.`,
      )
    : t(
        `cuéntale al usuario lo que encontró la revisión y pídele que acepte con \`${ctx.command} accept\`, o, si pide arreglar algo, ejecuta \`${ctx.command} adjust "<petición literal>"\`. La revisión es información: decide la persona.`,
        `tell the user what the review found and ask them to accept with \`${ctx.command} accept\` or, if they ask to fix something, run \`${ctx.command} adjust "<literal request>"\`. The review is information: the person decides.`,
      );
}
