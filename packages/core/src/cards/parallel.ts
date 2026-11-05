// SPDX-License-Identifier: Apache-2.0
import type { Lang } from "../i18n";
import { headerOf, type Output, type OutputBlock, section } from "../output";
import { type Translate, translator } from "./text";
import type { CardContext } from "./view";

// Working in parallel, a worktree per change: files another open change also lists, preparing a
// new folder, and cleaning up the folders and branches of finished changes (`prune`).

/** A file another open change also lists, and those changes. */
export function sharedLine(path: string, changes: readonly string[], lang: Lang): string {
  return translator(lang)(
    `${path} — también en ${changes.join(", ")}`,
    `${path} — also in ${changes.join(", ")}`,
  );
}

export function sharedTitle(lang: Lang): string {
  return translator(lang)("ARCHIVOS COMPARTIDOS", "SHARED FILES");
}

/** What Specty prints on stderr while it prepares a new change's folder. */
export function preparingNote(command: string, lang: Lang): string {
  return `specty: ${translator(lang)("preparando la carpeta con", "preparing the folder with")} \`${command}\`…`;
}

/** A finished change's folder kept, because an agent session still works in it. */
export function workingFolderLine(folder: string, lang: Lang): string {
  return translator(lang)(
    `${folder}: una sesión de agente trabaja en ella.`,
    `${folder}: an agent session works in it.`,
  );
}

/** A folder kept, because its change has not reached the main branch yet. */
export function notInTargetFolderLine(
  folder: string,
  id: string,
  target: string,
  lang: Lang,
): string {
  return translator(lang)(
    `${folder}: ${id} aún no está en ${target}.`,
    `${folder}: ${id} is not in ${target} yet.`,
  );
}

/** A branch kept, because the main branch does not contain it. */
export function notInTargetBranchLine(branch: string, target: string, lang: Lang): string {
  return translator(lang)(`${branch}: no está en ${target}.`, `${branch}: not in ${target}.`);
}

/**
 * What processes that died left in git's folders, by kind: half-done writes (`<file>.<pid>.tmp`),
 * the live runs of verifications cut off, and temporary git indexes over an hour old.
 */
interface Leftovers {
  readonly writes: number;
  readonly runs: number;
  readonly indexes: number;
}

/** `specty prune`: the folders and branches it removed, and the ones it kept, with why. */
export function pruneCard(
  pruned: {
    readonly folders: readonly string[];
    readonly branches: readonly string[];
    readonly kept: readonly string[];
    /** How many activity records of conversations that no longer work it removed (ADR 0016). */
    readonly activity?: number;
    /** The changes, no longer open, whose messages it removed. */
    readonly messages?: readonly string[];
    /** How many units it removed from the record of those that passed, older than `days`. */
    readonly units?: { readonly removed: number; readonly days: number };
    /** What processes that died left in git's folders, and it removed. */
    readonly leftovers?: Leftovers;
  },
  ctx: CardContext,
): Output {
  const t = translator(ctx.lang);
  const activity = pruned.activity ?? 0;
  const messages = pruned.messages ?? [];
  const { removed = 0, days = 0 } = pruned.units ?? {};
  const { writes = 0, runs = 0, indexes = 0 } = pruned.leftovers ?? {};
  const counts = [pruned.folders.length, pruned.branches.length, activity, messages.length];
  const nothing = [...counts, removed, writes, runs, indexes].every((count) => count === 0);
  return {
    status: "ok",
    header: headerOf(t("limpieza", "cleanup")),
    blocks: [
      ...section(
        undefined,
        nothing ? [t("No había nada que limpiar.", "There was nothing to clean up.")] : [],
      ),
      ...section(t("CARPETAS BORRADAS", "FOLDERS REMOVED"), pruned.folders),
      ...section(t("RAMAS BORRADAS", "BRANCHES DELETED"), pruned.branches),
      ...recordSections(activity, messages, { removed, days }, t),
      ...leftoverSection({ writes, runs, indexes }, t),
      ...section(t("QUEDAN", "KEPT"), pruned.kept),
    ],
    next: t(
      `para otro cambio, \`${ctx.command} new "<título>"\`.`,
      `for another change, \`${ctx.command} new "<title>"\`.`,
    ),
  };
}

/**
 * What `prune` removed of Specty's own records: the activity of conversations, the messages and
 * the units of the record of those that passed.
 */
function recordSections(
  activity: number,
  messages: readonly string[],
  { removed, days }: { readonly removed: number; readonly days: number },
  t: Translate,
): OutputBlock[] {
  return [
    ...counted(
      activity,
      t("ACTIVIDAD BORRADA", "ACTIVITY REMOVED"),
      t(
        `Registros de conversaciones que ya no trabajan: ${activity}.`,
        `Records of conversations that no longer work: ${activity}.`,
      ),
    ),
    ...section(t("MENSAJES BORRADOS", "MESSAGES REMOVED"), messages),
    ...counted(
      removed,
      t("UNIDADES BORRADAS DEL REGISTRO", "UNITS REMOVED FROM THE RECORD"),
      t(
        `Anotadas hace más de ${days} días: ${removed}.`,
        `Recorded more than ${days} days ago: ${removed}.`,
      ),
    ),
  ];
}

/** The leftovers of processes that died that `prune` removed: a line for each kind with some. */
function leftoverSection({ writes, runs, indexes }: Leftovers, t: Translate): OutputBlock[] {
  const lines: readonly (readonly [number, string])[] = [
    [writes, t(`Escrituras a medias: ${writes}.`, `Half-done writes: ${writes}.`)],
    [runs, t(`Verificaciones cortadas: ${runs}.`, `Cut-off verifications: ${runs}.`)],
    [
      indexes,
      t(
        `Índices temporales de git de más de una hora: ${indexes}.`,
        `Temporary git indexes over an hour old: ${indexes}.`,
      ),
    ],
  ];
  return section(
    t("RESTOS DE PROCESOS QUE MURIERON", "LEFTOVERS OF PROCESSES THAT DIED"),
    lines.flatMap(([count, line]) => (count === 0 ? [] : [line])),
  );
}

/** A section with the line that counts what went, or none when nothing did. */
function counted(count: number, title: string, line: string): OutputBlock[] {
  return section(title, count === 0 ? [] : [line]);
}
