// SPDX-License-Identifier: Apache-2.0
import { headerOf, type Output } from "../output";
import { blockedCard } from "./flow";
import { translator } from "./text";
import type { CardContext } from "./view";

/** The command that holds a change's lock: its subcommand, process, start and folder. */
export interface LockHolderView {
  readonly command: string;
  readonly pid: number;
  /** ISO 8601, in UTC. */
  readonly at: string;
  /** Relative to the folder of the refused command; empty when it is the same one. */
  readonly folder: string;
}

/** Another command is changing the change: this one does nothing and asks to wait. */
export function busyChangeCard(id: string, holder: LockHolderView, ctx: CardContext): Output {
  const t = translator(ctx.lang);
  const command = `\`${ctx.command} ${holder.command}\``;
  const since = `${holder.at.slice(0, 10)} ${holder.at.slice(11, 19)} UTC`;
  const where =
    holder.folder === ""
      ? t("en esta carpeta", "in this folder")
      : t(`en ${holder.folder}`, `in ${holder.folder}`);
  return blockedCard(
    headerOf(id),
    t(
      `Otro comando está cambiando ${id}: ${command} (pid ${holder.pid}, desde ${since}, ${where}). Dos a la vez pisarían su estado.`,
      `Another command is changing ${id}: ${command} (pid ${holder.pid}, since ${since}, ${where}). Two at once would overwrite its state.`,
    ),
    t(
      "espera a que termine y vuelve a ejecutar tu comando; si ese proceso ya no existe, su bloqueo deja de contar solo.",
      "wait for it to finish and run your command again; if that process no longer exists, its lock stops counting by itself.",
    ),
  );
}
