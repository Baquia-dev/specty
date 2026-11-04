// SPDX-License-Identifier: Apache-2.0
import type { Phase } from "../flow/phases";
import { headerOf, type Output, section } from "../output";
import { blockedCard } from "./flow";
import { type WorktreeCreated, workspaceLines, worktreeCreatedNext } from "./new";
import { type Translate, translator } from "./text";
import type { CardContext } from "./view";

/** A change's folder `specty restore` brought back from its branch. */
export interface Restored
  extends Pick<
    WorktreeCreated,
    "id" | "branch" | "folder" | "prepared" | "copied" | "workspace" | "byName" | "agent"
  > {
  readonly phase: Phase;
  /**
   * Git recognized again the folder that was already in the change's place (`git worktree
   * repair`): its files stay as they were, and nothing was checked out nor prepared.
   */
  readonly repaired: boolean;
}

/** Why `specty restore` brought no folder back. */
export type RestoreRefusal =
  /** No open change with a branch has that id and no folder. */
  | { readonly reason: "unknown"; readonly id: string }
  /** The change has its folder. */
  | { readonly reason: "has-folder"; readonly id: string; readonly folder: string }
  /** A folder git does not recognize as the change's is in its place, even after repairing it. */
  | { readonly reason: "in-the-way"; readonly id: string; readonly folder: string }
  /** Git refused to check the branch out, with what it said. */
  | { readonly reason: "git"; readonly id: string; readonly detail: string };

/**
 * `specty restore`: where the change's folder is again and how the session carries on there, what
 * did not come back, and how the folder was prepared; a failed preparation goes first in the way on.
 */
export function restoredCard(restored: Restored, ctx: CardContext): Output {
  const t = translator(ctx.lang);
  return {
    status: "ok",
    header: headerOf(restored.id, restored.phase),
    blocks: [
      { lines: restoredLines(restored, t) },
      ...section(t("HOOKS DEL AGENTE COPIADOS", "AGENT HOOKS COPIED"), restored.copied),
      ...section(t("WORKSPACE DE GO COPIADO", "GO WORKSPACE COPIED"), workspaceLines(restored, t)),
      ...(restored.prepared?.ok === false
        ? [
            {
              title: t(
                `FALLÓ \`${restored.prepared.command}\``,
                `\`${restored.prepared.command}\` FAILED`,
              ),
              lines: restored.prepared.output,
            },
          ]
        : []),
    ],
    next: worktreeCreatedNext(restored, ctx),
  };
}

/** Where the folder is, what did not come back with it and how it was prepared. */
function restoredLines(restored: Restored, t: Translate): string[] {
  const { id, branch, folder, prepared } = restored;
  if (restored.repaired) {
    return [
      t(
        `Git volvió a reconocer ${folder} como la carpeta del cambio ${id} (rama ${branch}): queda como estaba.`,
        `Git recognizes ${folder} again as the folder of change ${id} (branch ${branch}): it stays as it was.`,
      ),
    ];
  }
  return [
    t(
      `Carpeta recuperada: ${id} (rama ${branch}) en ${folder}.`,
      `Folder restored: ${id} (branch ${branch}) in ${folder}.`,
    ),
    t(
      "Lo que no estaba confirmado en la rama cuando se perdió la carpeta no vuelve.",
      "What was not committed on the branch when the folder was lost does not come back.",
    ),
    ...(prepared?.ok === true
      ? [
          t(
            `Carpeta preparada con \`${prepared.command}\`.`,
            `Folder prepared with \`${prepared.command}\`.`,
          ),
        ]
      : []),
  ];
}

/** `specty restore` that brought no folder back: why, and what to do instead. */
export function restoreRefusalCard(refusal: RestoreRefusal, ctx: CardContext): Output {
  const t = translator(ctx.lang);
  return blockedCard(
    headerOf(refusal.reason === "unknown" ? undefined : refusal.id),
    refusalReason(refusal, t),
    refusalNext(refusal, t, ctx.command),
  );
}

/** Why no folder came back. */
function refusalReason(refusal: RestoreRefusal, t: Translate): string {
  const { id } = refusal;
  switch (refusal.reason) {
    case "unknown":
      return t(
        `No hay un cambio abierto sin carpeta con el id ${id}.`,
        `There is no open change without its folder with id ${id}.`,
      );
    case "has-folder":
      return t(
        `El cambio ${id} tiene su carpeta en ${refusal.folder}: no hay nada que recuperar.`,
        `Change ${id} has its folder in ${refusal.folder}: there is nothing to restore.`,
      );
    case "in-the-way":
      return t(
        `En ${refusal.folder} hay una carpeta que git no reconoce como la del cambio ${id}, y \`git worktree repair\` no la recuperó: Specty no la toca.`,
        `In ${refusal.folder} there is a folder git does not recognize as change ${id}'s, and \`git worktree repair\` did not bring it back: Specty does not touch it.`,
      );
    case "git":
      return t(
        `Git no pudo recrear la carpeta del cambio ${id}: ${refusal.detail}`,
        `Git could not recreate the folder of change ${id}: ${refusal.detail}`,
      );
  }
}

/** What to do instead: look at `status`, carry on in the folder, or clear the way and retry. */
function refusalNext(refusal: RestoreRefusal, t: Translate, command: string): string {
  const restore = `\`${command} restore ${refusal.id}\``;
  switch (refusal.reason) {
    case "unknown":
      return t(
        `revisa \`${command} status\`, que lista los cambios sin carpeta.`,
        `check \`${command} status\`, which lists the changes without their folder.`,
      );
    case "has-folder":
      return t(
        `sigue con el cambio en ${refusal.folder} y ejecuta allí \`${command} next\`.`,
        `carry on with the change in ${refusal.folder} and run \`${command} next\` there.`,
      );
    case "in-the-way":
      return t(
        `pídele a la persona que aparte ${refusal.folder} (que la mueva, o que la borre si no necesita sus archivos) y vuelve a ejecutar ${restore}.`,
        `ask the person to move ${refusal.folder} aside (move it, or delete it if they do not need its files) and run ${restore} again.`,
      );
    case "git":
      return t(
        `corrige lo que dice git y vuelve a ejecutar ${restore}.`,
        `fix what git says and run ${restore} again.`,
      );
  }
}
