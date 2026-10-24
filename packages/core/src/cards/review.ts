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

/** What the review command reads on its standard input to review a spec. */
export function specReviewPrompt(spec: string, lang: Lang): string {
  return `${SPEC_INSTRUCTIONS[lang]}\n\n<spec>\n${spec.trimEnd()}\n</spec>\n`;
}

export interface ReviewedView {
  readonly header: string;
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
    blocks: section(
      t(`REVISIÓN INDEPENDIENTE (${view.command})`, `INDEPENDENT REVIEW (${view.command})`),
      [t(`Guardada en ${view.path}.`, `Kept in ${view.path}.`), ...shown],
    ),
    next: t(
      `corrige en la spec lo que sea un problema real y vuelve a ejecutar \`${ctx.command} propose\`; ${approve}. La revisión es información: decide la persona.`,
      `fix in the spec what is a real problem and run \`${ctx.command} propose\` again; ${approve}. The review is information: the person decides.`,
    ),
  };
}
