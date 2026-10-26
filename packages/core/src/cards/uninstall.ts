// SPDX-License-Identifier: Apache-2.0
import type { Lang } from "../i18n";
import { headerOf, type Output, type OutputBlock, section } from "../output";
import { translator } from "./text";
import type { CardContext } from "./view";

// The texts of `specty uninstall`: what it would remove, its question, and what it left.

/** A file `uninstall` changes: deleted whole, or with only Specty's part taken out. */
export function removalLine(path: string, removed: boolean, lang: Lang): string {
  const t = translator(lang);
  return removed
    ? t(`borrar ${path}`, `delete ${path}`)
    : t(`quitar lo de Specty de ${path}`, `remove Specty's part of ${path}`);
}

function uninstallCard(blocks: readonly OutputBlock[], next: string): Output {
  return { status: "ok", header: headerOf("uninstall"), blocks, next };
}

export function nothingToRemoveCard(ctx: CardContext): Output {
  const t = translator(ctx.lang);
  return uninstallCard(
    section(undefined, [
      t(
        "No hay nada de Specty que quitar en este repositorio.",
        "There is nothing of Specty to remove in this repository.",
      ),
    ]),
    t("nada que hacer.", "nothing to do."),
  );
}

/** `uninstall --dry-run`: what it would remove, and how to remove it for real. */
export function removalPlanCard(lines: readonly string[], ctx: CardContext): Output {
  const t = translator(ctx.lang);
  return uninstallCard(
    section(t("SE QUITARÍA", "WOULD REMOVE"), lines),
    t(
      `para quitarlo, ejecuta \`${ctx.command} uninstall\` en tu terminal.`,
      `to remove it, run \`${ctx.command} uninstall\` in your terminal.`,
    ),
  );
}

/** The title of the note that lists what `uninstall` removes, before its question. */
export function removalNoteTitle(lang: Lang): string {
  return translator(lang)("Quitar Specty", "Remove Specty");
}

export function removalQuestion(lang: Lang): string {
  return translator(lang)(
    "¿Quitar Specty de este repositorio?",
    "Remove Specty from this repository?",
  );
}

/** The answers to `removalQuestion`: the first, keeping everything, is the default. */
export function removalChoices(
  lang: Lang,
): readonly { readonly value: "no" | "yes"; readonly label: string }[] {
  const t = translator(lang);
  return [
    { value: "no", label: t("No, lo dejo como está", "No, leave it as it is") },
    { value: "yes", label: t("Sí, quítalo", "Yes, remove it") },
  ];
}

export function nothingRemovedCard(ctx: CardContext): Output {
  const t = translator(ctx.lang);
  return uninstallCard(
    section(undefined, [t("No se ha quitado nada.", "Nothing was removed.")]),
    t("nada que hacer.", "nothing to do."),
  );
}

/** What `uninstall` removed and what it left on purpose; the person commits it when they like. */
export function removedCard(
  removed: readonly string[],
  stays: readonly string[],
  ctx: CardContext,
): Output {
  const t = translator(ctx.lang);
  return uninstallCard(
    [...section(t("QUITADO", "REMOVED"), removed), ...section(t("SE QUEDA", "STAYS"), stays)],
    t(
      "revisa los cambios con `git status` y haz commit cuando quieras: ya no hay hooks que lo vigilen.",
      "review the changes with `git status` and commit them when you like: no hooks watch it any more.",
    ),
  );
}

/** `.specty/`, which `uninstall` keeps: the history of the changes. */
export function historyStaysLine(lang: Lang): string {
  return translator(lang)(
    "`.specty/`: el historial de specs y auditoría; bórrala si no lo quieres.",
    "`.specty/`: the history of specs and audit; delete it if you do not want it.",
  );
}

/** A guard in the user's configuration, which serves every repository: `uninstall` keeps it. */
export function globalGuardStaysLine(tool: string, file: string, lang: Lang): string {
  return translator(lang)(
    `${tool}: el guard sigue en ${file}, que sirve a todos tus repositorios y fuera de los que usan Specty no hace nada; quítalo de ahí si ya no usas Specty.`,
    `${tool}: the guard stays in ${file}, which serves all your repositories and does nothing outside those using Specty; remove it there if you no longer use Specty.`,
  );
}

export function claudePointerStaysLine(lang: Lang): string {
  return translator(lang)(
    "CLAUDE.md sigue importando AGENTS.md.",
    "CLAUDE.md still imports AGENTS.md.",
  );
}

/** Removing Specty with a change in progress leaves its tasks without anything that watches them. */
export function unwatchedChangeWarning(id: string, lang: Lang): string {
  return translator(lang)(
    `Esta carpeta tiene un cambio en curso (${id}): sin Specty, nadie vigila sus tareas.`,
    `This folder has a change in progress (${id}): without Specty, nobody watches its tasks.`,
  );
}
