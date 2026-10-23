// SPDX-License-Identifier: Apache-2.0
import type { Session } from "../session";
import { addReceipt, type ReceiptKind } from "../store/local";

export interface CommitRequest {
  readonly subject: string;
  readonly trailers: Readonly<Record<string, string>>;
  /** Pathspecs to stage with `git add -A`, in order (exclusions apply per call). */
  readonly stage: readonly (readonly string[])[];
  /** Commit only these paths (`git commit -- paths`) instead of the whole index. */
  readonly only?: readonly string[];
  readonly receipt: { readonly change: string; readonly kind: ReceiptKind; readonly task?: string };
}

/**
 * Commits on behalf of the flow. The receipt for the exact tree lets Specty's own
 * pre-commit hook accept the commit (ARCHITECTURE §9, "Recibos").
 */
export async function commitWithReceipt(session: Session, request: CommitRequest): Promise<string> {
  const { git } = session;
  // Worktrees inside this one belong to other changes; `git add -A` would embed them.
  const nested = (await git.nestedWorktrees()).map((folder) => `:(exclude)${folder}`);
  for (const pathspecs of request.stage) {
    await git.output(["add", "-A", "--", ...pathspecs, ...nested]);
  }
  const tree =
    request.only === undefined ? await git.writeTree() : await git.treeWith(request.only);
  await addReceipt(git, {
    tree,
    change: request.receipt.change,
    kind: request.receipt.kind,
    ...(request.receipt.task !== undefined ? { task: request.receipt.task } : {}),
    createdAt: session.environment.now().toISOString(),
  });
  const message = `${request.subject}\n\n${Object.entries(request.trailers)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n")}\n`;
  const sha = await git.commit(message, request.only);
  return sha.slice(0, 7);
}

/** Trailers every commit of a change carries. */
export function changeTrailers(
  session: Session,
  change: string,
  extra: Readonly<Record<string, string>> = {},
): Record<string, string> {
  return {
    "Specty-Change": change,
    ...extra,
    ...(session.actor === "agent" && session.tool !== undefined
      ? { "Specty-Agent": session.tool }
      : {}),
  };
}
