// SPDX-License-Identifier: Apache-2.0
import type { Phase } from "../flow/phases";
import type { Lang } from "../i18n";
import { headerOf, type Output } from "../output";
import { blockedCard } from "./flow";
import { runNext, translator } from "./text";
import type { CardContext } from "./view";

/** Why `specty retro` documents nothing. */
export type RetroRefusal =
  | { readonly reason: "in-progress"; readonly id: string; readonly phase: Phase }
  | { readonly reason: "nothing-staged" }
  /** `--minimal` needs `retro.mode: minimal` and a person at the terminal. */
  | { readonly reason: "minimal-unavailable" }
  | { readonly reason: "no-reason" };

/** A `specty retro` that documents nothing, with the way on. */
export function retroRefusalCard(refusal: RetroRefusal, ctx: CardContext): Output {
  const t = translator(ctx.lang);
  switch (refusal.reason) {
    case "in-progress":
      return blockedCard(
        headerOf(refusal.id, refusal.phase),
        t(
          `Ya hay una retro en curso: ${refusal.id}.`,
          `A retro is already in progress: ${refusal.id}.`,
        ),
        runNext(ctx),
      );
    case "nothing-staged":
      return blockedCard(
        headerOf(),
        t("No hay código gobernado preparado.", "There is no staged governed code."),
        t(
          `prepara los cambios con \`git add\` y vuelve a ejecutar \`${ctx.command} retro\`.`,
          `stage the changes with \`git add\` and run \`${ctx.command} retro\` again.`,
        ),
      );
    case "minimal-unavailable":
      return blockedCard(
        headerOf(),
        t(
          "El modo minimal no está activado (retro.mode: minimal) o no hay una persona en la terminal.",
          "Minimal mode is not enabled (retro.mode: minimal) or there is no person at the terminal.",
        ),
        t(
          "pídele a tu agente: «Documenta los cambios preparados con specty retro».",
          'ask your agent: "Document the staged changes with specty retro".',
        ),
      );
    case "no-reason":
      return blockedCard(
        headerOf(),
        t("Sin motivo no hay retro.", "No reason, no retro."),
        t(
          `vuelve a ejecutar \`${ctx.command} retro --minimal\`.`,
          `run \`${ctx.command} retro --minimal\` again.`,
        ),
      );
  }
}

/** The title of a retro's spec: the modules its staged files belong to. */
export function retroTitle(modules: string, lang: Lang): string {
  return translator(lang)(`Cambios manuales en ${modules}`, `Manual changes in ${modules}`);
}

/** What `retro --minimal` asks the person at the terminal. */
export function retroReasonQuestion(lang: Lang): string {
  return translator(lang)("¿Por qué hiciste estos cambios?", "Why did you make these changes?");
}

/** The retro is documented: the person repeats their commit. */
export function retroDoneCard(id: string, ctx: CardContext): Output {
  const t = translator(ctx.lang);
  return {
    status: "ok",
    header: headerOf(id, "done"),
    blocks: [
      {
        lines: [
          t(
            "Cambios documentados y preparados junto a tu commit.",
            "Changes documented and staged with your commit.",
          ),
        ],
      },
    ],
    next: t("vuelve a ejecutar `git commit`.", "run `git commit` again."),
  };
}
