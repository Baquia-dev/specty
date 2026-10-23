// SPDX-License-Identifier: Apache-2.0
import { headerOf, type Output, section, translator } from "@baquia-dev/specty-core";
import { deleteMerged, removeFinished } from "../flow/prune";
import type { Session } from "../session";

/**
 * `specty prune`: removes the folders of finished changes and deletes the change branches already
 * in the target branch. Only what is already incorporated goes, so the agent may run it too.
 */
export async function prune(session: Session): Promise<Output> {
  const t = translator(session.lang);
  const folders = await removeFinished(session);
  const branches = await deleteMerged(session);
  const nothing = folders.removed.length === 0 && branches.removed.length === 0;
  return {
    status: "ok",
    header: headerOf(t("limpieza", "cleanup")),
    blocks: [
      ...section(
        undefined,
        nothing ? [t("No había nada que limpiar.", "There was nothing to clean up.")] : [],
      ),
      ...section(t("CARPETAS BORRADAS", "FOLDERS REMOVED"), folders.removed),
      ...section(t("RAMAS BORRADAS", "BRANCHES DELETED"), branches.removed),
      ...section(t("QUEDAN", "KEPT"), [...folders.kept, ...branches.kept]),
    ],
    next: t(
      `para otro cambio, \`${session.cards.command} new "<título>"\`.`,
      `for another change, \`${session.cards.command} new "<title>"\`.`,
    ),
  };
}
