// SPDX-License-Identifier: Apache-2.0
import { busyChangeCard, type Output, renderText } from "@baquia-dev/specty-core";
import { pendingIntegration } from "../commands/integrate";
import { type Integration, mergeTarget } from "../flow/integrate";
import type { Session } from "../session";
import { loadChange } from "../store/changes";
import { lockChange } from "../store/lock";
import { posixRelative } from "../store/paths";

/**
 * «Verificar» of the UI when the branch the change goes to (`plan.target`) moved on since the
 * change's: it comes in first, as in `specty accept` (`mergeTarget`), so that the full
 * verification runs once, on the merged code, and `accept` finds it recorded. It goes on only
 * while change `id` is in acceptance and no agent resolves an earlier incorporation, with the
 * change locked against other processes. What it said, for the run's output: the merge's lines,
 * or the card of what stopped it.
 */
export async function mergedVerification(
  there: Session,
  id: string,
  plan: Integration,
): Promise<readonly string[]> {
  const change = await loadChange(there.paths, id);
  // Accepted meanwhile, from the terminal or another tab: that acceptance merged main already.
  if (change?.state.phase !== "acceptance") return [];
  const pending = await pendingIntegration(there, change, "accept");
  if (pending.kind === "wait") return linesOf(there, pending.output);
  const lock = await lockChange(there.git, id, {
    pid: process.pid,
    command: "ui",
    folder: there.root,
    at: there.environment.now().toISOString(),
  });
  if (lock.kind === "busy") {
    const folder = posixRelative(there.root, lock.holder.folder);
    return linesOf(there, busyChangeCard(id, { ...lock.holder, folder }, there.cards));
  }
  try {
    const absorbed = await mergeTarget(there, plan, pending.change, "accept");
    return absorbed.ok ? absorbed.lines : linesOf(there, absorbed.output);
  } finally {
    await lock.release();
  }
}

/** A card as the terminal shows it, line by line. */
function linesOf(session: Session, output: Output): readonly string[] {
  return renderText(output, session.lang).split("\n");
}
