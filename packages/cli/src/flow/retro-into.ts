// SPDX-License-Identifier: Apache-2.0
import { type ChangeState, hashText, isGoverned, parseSpec } from "@baquia-dev/specty-core";
import { pathsOf } from "../io/git";
import type { Session } from "../session";
import { readSpec, type StoredChange } from "../store/changes";
import { addReceipt } from "../store/local";
import { commitState } from "./active";

/**
 * What `retro --into` shares with the pre-commit hook and the approval of its request
 * (ARCHITECTURE §9): the change's scope, the staged code and its print, and the confirmation.
 */

type ScopeRequest = ChangeState["pending"]["scopeRequests"][number];

/** Every path the change declares or has been granted. */
export async function changeScope(session: Session, change: StoredChange): Promise<string[]> {
  const spec = parseSpec(await readSpec(change.files), { language: session.lang }).spec;
  const declared = (spec.sections.files?.items ?? []).flatMap((entry) =>
    entry.from === undefined ? [entry.path] : [entry.path, entry.from],
  );
  const extras = Object.values(change.state.tasks).flatMap((task) => task.scopeExtra);
  return [...declared, ...extras];
}

/** The staged governed paths outside `.specty/`, both sides of each rename. */
export async function stagedGoverned(session: Session): Promise<string[]> {
  return pathsOf(await session.git.staged()).filter(
    (path) => !path.startsWith(".specty/") && isGoverned(path, session.config),
  );
}

/**
 * The print of the staged governed code: each path with its mode and blob (`git ls-files -s`),
 * deleted ones by their path alone. Staging, unstaging or editing any of them changes it.
 */
export async function stagedPrint(session: Session): Promise<string> {
  const paths = new Set(await stagedGoverned(session));
  const entries = (await session.git.output(["ls-files", "-s", "-z"]))
    .split("\0")
    .filter((entry) => paths.has(entry.slice(entry.indexOf("\t") + 1)));
  return hashText([...[...paths].sort(), ...entries.sort()].join("\n"));
}

/**
 * The approved request of `retro --into` documents the staged code in `change`: the audit
 * records it, the change's folder joins the index and a receipt lets the person's commit through.
 */
export async function confirmRetroInto(
  session: Session,
  change: StoredChange,
  request: ScopeRequest,
): Promise<void> {
  await commitState(session, change, change.state, "retro.confirmed", {
    request: request.id,
    paths: request.paths,
  });
  await session.git.output(["add", "-A", "--", session.paths.relative(change.files.dir)]);
  await addReceipt(session.git, {
    tree: await session.git.writeTree(),
    change: change.state.id,
    kind: "retro",
    createdAt: session.environment.now().toISOString(),
  });
}
