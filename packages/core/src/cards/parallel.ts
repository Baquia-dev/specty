// SPDX-License-Identifier: Apache-2.0
import type { Lang } from "../i18n";
import { headerOf, type Output, type OutputBlock, section } from "../output";
import { type Translate, translator } from "./text";
import type { CardContext } from "./view";

// Working in parallel, a worktree per change: files another open change also lists, preparing a
// new folder, and cleaning up the folders and branches of finished changes and the orphans, with
// the rescue refs of what they had (`prune`, and the clean-up at the end of `new`, `close` and
// `cancel`).

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

/** A folder whose work the clean-up saved in a rescue ref before removing it. */
export interface RescuedFolder {
  readonly folder: string;
  /** `refs/specty/rescue/<name>/<YYYYMMDDHHMMSS>`. */
  readonly ref: string;
  /** What the blobs it saved weigh, new against the commit it went on top of. */
  readonly bytes: number;
}

/** A folder the clean-up could not save in a rescue ref, so it stays with what it has. */
export interface UnsavedFolder {
  readonly folder: string;
  /** Git's reason. */
  readonly reason: string;
}

/** From this weight on, the line of a rescue ref says how much it saved (R2 of the epic). */
const HEAVY_BYTES = 10 * 1024 * 1024;

/** A rescue ref, with how to see what it saved and get it back, and its weight when heavy. */
function rescuedLine({ folder, ref, bytes }: RescuedFolder, t: Translate): string {
  const mb = Math.round(bytes / (1024 * 1024));
  const weight = bytes >= HEAVY_BYTES ? t(` Pesa ${mb} MB.`, ` It weighs ${mb} MB.`) : "";
  const line = t(
    `${folder}: lo que tenía sin commit quedó en ${ref}; míralo con \`git show ${ref}\` y recupéralo con \`git worktree add <carpeta> ${ref}\`.`,
    `${folder}: what it had uncommitted is in ${ref}; see it with \`git show ${ref}\` and get it back with \`git worktree add <folder> ${ref}\`.`,
  );
  return `${line}${weight}`;
}

/** A folder that stays because what it has could not be saved, with git's reason. */
function unsavedLine({ folder, reason }: UnsavedFolder, t: Translate): string {
  return t(
    `${folder}: lo que tiene no se pudo guardar en una ref de rescate, así que queda: ${reason}`,
    `${folder}: what it has could not be saved in a rescue ref, so it stays: ${reason}`,
  );
}

/** The subject of the commit of a rescue ref, which keeps what the folder `name` had. */
export function rescueCommitSubject(name: string, lang: Lang): string {
  return `wip: ${translator(lang)(`lo que ${name} tenía sin commit al quitar su carpeta`, `what ${name} had uncommitted when its folder was removed`)}`;
}

/** The ghost folders removed, and the rescue refs of what the folders removed had. */
function rescueSections(
  ghosts: readonly string[],
  rescued: readonly RescuedFolder[],
  t: Translate,
): OutputBlock[] {
  return [
    ...section(t("CARPETAS FANTASMA BORRADAS", "GHOST FOLDERS REMOVED"), ghosts),
    ...section(
      t("GUARDADO EN REFS DE RESCATE", "SAVED IN RESCUE REFS"),
      rescued.map((folder) => rescuedLine(folder, t)),
    ),
  ];
}

/**
 * What `new`, `close` and `cancel` add to their card of the clean-up at their end: the folders of
 * finished changes removed (`new` says them itself, so it leaves `finished` out), the ghost ones,
 * the rescue refs and the folders that stay because they could not be saved.
 */
export function cleanupBlocks(
  swept: {
    readonly finished?: readonly string[];
    readonly ghosts: readonly string[];
    readonly rescued: readonly RescuedFolder[];
    readonly unsaved: readonly UnsavedFolder[];
  },
  lang: Lang,
): OutputBlock[] {
  const t = translator(lang);
  const { finished = [] } = swept;
  return [
    ...section(
      t("CARPETAS DE CAMBIOS TERMINADOS, BORRADAS", "FOLDERS OF FINISHED CHANGES, REMOVED"),
      finished,
    ),
    ...rescueSections(swept.ghosts, swept.rescued, t),
    ...section(
      t("QUEDAN", "KEPT"),
      swept.unsaved.map((folder) => unsavedLine(folder, t)),
    ),
  ];
}

/** What `prune` did with the orphans besides the folders of finished changes (ARCHITECTURE §9). */
interface Orphans {
  /** The ghost folders it removed. */
  readonly ghosts?: readonly string[];
  /** What it saved in rescue refs before removing a folder. */
  readonly rescued?: readonly RescuedFolder[];
  /** The folders it could not save, which stay with what they have. */
  readonly unsaved?: readonly UnsavedFolder[];
  /** How many records of worktrees whose folder no longer existed git forgot. */
  readonly records?: number;
  /** The folders of `.specty/changes/` with no file that it removed. */
  readonly empty?: readonly string[];
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
  } & Orphans,
  ctx: CardContext,
): Output {
  const t = translator(ctx.lang);
  const activity = pruned.activity ?? 0;
  const messages = pruned.messages ?? [];
  const { removed = 0, days = 0 } = pruned.units ?? {};
  const { writes = 0, runs = 0, indexes = 0 } = pruned.leftovers ?? {};
  const { ghosts = [], rescued = [], unsaved = [], records = 0, empty = [] } = pruned;
  const counts = [pruned.folders.length, pruned.branches.length, activity, messages.length];
  const orphans = [ghosts.length, rescued.length, records, empty.length];
  const nothing = [...counts, ...orphans, removed, writes, runs, indexes].every(
    (count) => count === 0,
  );
  return {
    status: "ok",
    header: headerOf(t("limpieza", "cleanup")),
    blocks: [
      ...section(
        undefined,
        nothing ? [t("No había nada que limpiar.", "There was nothing to clean up.")] : [],
      ),
      ...section(t("CARPETAS BORRADAS", "FOLDERS REMOVED"), pruned.folders),
      ...rescueSections(ghosts, rescued, t),
      ...section(t("RAMAS BORRADAS", "BRANCHES DELETED"), pruned.branches),
      ...orphanSections(records, empty, t),
      ...recordSections(activity, messages, { removed, days }, t),
      ...leftoverSection({ writes, runs, indexes }, t),
      ...section(t("QUEDAN", "KEPT"), [
        ...pruned.kept,
        ...unsaved.map((folder) => unsavedLine(folder, t)),
      ]),
    ],
    next: t(
      `para otro cambio, \`${ctx.command} new "<título>"\`.`,
      `for another change, \`${ctx.command} new "<title>"\`.`,
    ),
  };
}

/** How many records of worktrees git forgot, and the empty folders of `.specty/changes/` removed. */
function orphanSections(records: number, empty: readonly string[], t: Translate): OutputBlock[] {
  return [
    ...counted(
      records,
      t("REGISTROS DE WORKTREES OLVIDADOS", "WORKTREE RECORDS FORGOTTEN"),
      t(
        `Registros de git de worktrees cuya carpeta ya no existía: ${records}.`,
        `Git records of worktrees whose folder no longer existed: ${records}.`,
      ),
    ),
    ...section(t("CARPETAS VACÍAS BORRADAS", "EMPTY FOLDERS REMOVED"), empty),
  ];
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
