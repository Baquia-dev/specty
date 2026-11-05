// SPDX-License-Identifier: Apache-2.0
import { mergedConfigInvalidLine, mergedConfigNext } from "@baquia-dev/specty-core";
import type { Session } from "../session";
import { loadConfig } from "../store/config";

/** Why the incorporation stops on the merged configuration, and what the person does. */
interface ConfigRefusal {
  readonly reason: string;
  readonly next: string;
}

/**
 * Right after merging `target` into the change's folder: when the merged `.specty/config.yaml`
 * is not valid, aborts the merge, so that the folder keeps the configuration it had and Specty
 * keeps working there, and says why. A merge left in progress would leave the folder stuck:
 * neither `next` nor the guard could read the configuration, and the agent may not edit it.
 * Undefined when it is valid.
 */
export async function invalidMergedConfig(
  session: Session,
  target: string,
  again: "close" | "accept",
): Promise<ConfigRefusal | undefined> {
  const loaded = await loadConfig(session.paths);
  if (loaded.kind !== "invalid") return undefined;
  await session.git.run(["merge", "--abort"]);
  const issues = loaded.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
  return {
    reason: mergedConfigInvalidLine(target, issues, session.lang),
    next: mergedConfigNext(target, again, session.cards),
  };
}
