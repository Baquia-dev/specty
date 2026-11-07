// SPDX-License-Identifier: Apache-2.0
import type { ChangeState } from "@baquia-dev/specty-core";
import { targetBranch } from "../flow/worktree";
import { maxOutputOf } from "../io/exec";
import { isRecord } from "../io/files";
import type { Session } from "../session";
import { type ChangeRecord, changeRecord } from "./records";

/** A test's code for the UI, or why there is none. */
type TestCodeAnswer =
  | { readonly kind: "code"; readonly text: string }
  | { readonly kind: "missing" };

const MISSING: TestCodeAnswer = { kind: "missing" };

/**
 * The code of `path`, a test of change `id` (docs/ui.md, Progreso): as the tip of the change's
 * branch has it or, once that branch is gone, as the main branch does, where the change landed.
 * What nobody committed does not show. It reads nothing that is not a test of the change.
 */
export async function testCode(
  session: Session,
  id: string,
  path: string,
): Promise<TestCodeAnswer> {
  const record = await changeRecord(session, id);
  if (record === undefined || !testsOf(record).has(path)) return MISSING;
  const ref = await refOf(session, record.state);
  if (ref === undefined) return MISSING;
  const shown = await session.git.run(["show", `${ref}:${path}`]);
  // Git is read whole; past `internal.exec.maxOutputKiB`, the browser is not given it either.
  if (shown.code !== 0 || shown.stdout.length >= maxOutputOf(session.config)) return MISSING;
  return { kind: "code", text: shown.stdout };
}

/**
 * The tests of a change (ADR 0014): those of its last sending (`tests.proposed`), those it
 * locked and those an approved unlock opened. A pending unlock asks for a locked one.
 */
function testsOf({ state, audit = [] }: ChangeRecord): ReadonlySet<string> {
  const sent = audit.findLast((entry) => entry.event === "tests.proposed");
  const unlocked = audit.filter((entry) => entry.event === "scope.decided");
  return new Set([
    ...pathsIn(sent, "files"),
    ...Object.keys(state.lockedTests ?? {}),
    ...unlocked.flatMap((entry) => pathsIn(entry, "unlock")),
  ]);
}

/** The paths an audit entry keeps under `key` of its data; none if it keeps something else. */
function pathsIn(entry: Readonly<Record<string, unknown>> | undefined, key: string): string[] {
  const data = entry?.data;
  const paths = isRecord(data) ? data[key] : undefined;
  return Array.isArray(paths) ? paths.filter((path) => typeof path === "string") : [];
}

/** The change's branch while it exists; then the main branch, where it landed. */
async function refOf(session: Session, state: ChangeState): Promise<string | undefined> {
  const { git } = session;
  if (state.branch !== undefined) {
    const ref = `refs/heads/${state.branch}`;
    if ((await git.run(["rev-parse", "--verify", "-q", ref])).code === 0) return ref;
  }
  const target = await targetBranch(git, session.config.git.target);
  return target === undefined ? undefined : `refs/heads/${target}`;
}
