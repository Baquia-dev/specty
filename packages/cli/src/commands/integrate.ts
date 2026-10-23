// SPDX-License-Identifier: Apache-2.0
import { type Output, translator } from "@baquia-dev/specty-core";
import { commitState } from "../flow/active";
import { askAgent, blocked } from "../flow/integrate";
import type { Session } from "../session";
import type { StoredChange } from "../store/changes";

export type Pending =
  | { readonly kind: "wait"; readonly output: Output }
  | { readonly kind: "go"; readonly change: StoredChange };

/**
 * Before closing or accepting: while the agent's merge is still in progress the person waits for
 * it; a merge someone aborted is forgotten, and the incorporation starts over.
 */
export async function pendingIntegration(
  session: Session,
  change: StoredChange,
  again: "close" | "accept",
): Promise<Pending> {
  const { integration, ...rest } = change.state;
  if (integration === undefined || integration.resolved !== undefined)
    return { kind: "go", change };
  const t = translator(session.lang);
  if ((await session.git.run(["rev-parse", "-q", "--verify", "MERGE_HEAD"])).code === 0) {
    const waiting = t(
      `El agente aún resuelve la incorporación de ${integration.target} en esta carpeta.`,
      `The agent is still resolving the incorporation of ${integration.target} in this folder.`,
    );
    return {
      kind: "wait",
      output: blocked(change.state, [waiting], undefined, askAgent(session, again)),
    };
  }
  const forgotten = await commitState(
    session,
    change,
    rest,
    "integration.abandoned",
    { target: integration.target },
    "specty",
  );
  return { kind: "go", change: forgotten };
}
