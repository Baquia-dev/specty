// SPDX-License-Identifier: Apache-2.0
// What an unlock of approved tests carries (ADR 0014): the exact change to them, checked against
// their locked version, and the lines that justify it, kept as they were when it was asked.
import { join, resolve } from "node:path";
import {
  type ChangeState,
  hashText,
  normalizePath,
  pathProblem,
  UNLOCK_LIMITS,
  type UnlockEvidence,
  type UnlockPatchRefusal,
  type UnlockRefusal,
} from "@baquia-dev/specty-core";
import { readText } from "../io/files";
import type { Session } from "../session";

/** `--patch` and `--evidence` of `specty scope add`. */
export interface UnlockOptions {
  /** A file, relative to where the command runs, or `-` for standard input. */
  readonly patch: string | undefined;
  /** Each one `<path>:<from>-<to>`. */
  readonly evidence: readonly string[];
  readonly stdin: () => Promise<string>;
}

/** The patch and the evidence of an unlock, ready for its request. */
export interface UnlockProposal {
  readonly patch: string;
  readonly evidence: readonly UnlockEvidence[];
}

export type UnlockChecked =
  | { readonly ok: true; readonly proposal: UnlockProposal }
  | { readonly ok: false; readonly refusal: UnlockRefusal };

/** The unlock of `locked`, approved tests of `state`, with what `options` give; or why not. */
export async function unlockProposal(
  session: Session,
  state: ChangeState,
  locked: readonly string[],
  options: UnlockOptions,
): Promise<UnlockChecked> {
  const missing = [
    ...(options.patch === undefined ? ["patch" as const] : []),
    ...(options.evidence.length === 0 ? ["evidence" as const] : []),
  ];
  if (options.patch === undefined || missing.length > 0) {
    return { ok: false, refusal: { reason: "incomplete", missing } };
  }
  const patch = await readPatch(session, options.patch, options.stdin);
  if (patch === undefined) {
    return { ok: false, refusal: { reason: "patch-unreadable", file: options.patch } };
  }
  const patchRefusal = await checkUnlockPatch(session, state, locked, patch);
  if (patchRefusal !== undefined) return { ok: false, refusal: patchRefusal };
  const evidence = await readEvidence(session, options.evidence);
  return "reason" in evidence
    ? { ok: false, refusal: evidence }
    : { ok: true, proposal: { patch, evidence: evidence.pieces } };
}

/** The patch's text, from its file or from standard input; undefined when it cannot be read. */
async function readPatch(
  session: Session,
  file: string,
  stdin: () => Promise<string>,
): Promise<string | undefined> {
  if (file === "-") return stdin();
  return readText(resolve(session.environment.cwd, file)).catch(() => undefined);
}

/**
 * Why `patch` does not do: too long, no diff, touching other files than the `locked` tests, or not
 * applying to their locked version. `--recount` reads each hunk by its lines, not by the counts of
 * its header, which an agent writes by hand. `scope add` checks it, and the approval again.
 */
export async function checkUnlockPatch(
  session: Session,
  state: ChangeState,
  locked: readonly string[],
  patch: string,
): Promise<UnlockPatchRefusal | undefined> {
  const lines = linesOf(patch).length;
  if (lines > UNLOCK_LIMITS.patchLines) return { reason: "patch-too-long", lines };
  const { git } = session;
  const listed = await git.run(["apply", "--numstat", "-z", "--recount", "-"], { input: patch });
  if (listed.code !== 0) return { reason: "patch-invalid", detail: firstLine(listed.stderr) };
  // Each record is `<added>\t<deleted>\t<path>`; a rename or a copy names its new path.
  const touched = listed.stdout
    .split("\0")
    .map((record) => record.split("\t").slice(2).join("\t"))
    .filter((path) => path.length > 0);
  const others = [...new Set(touched.filter((path) => !locked.includes(path)))];
  if (others.length > 0) return { reason: "patch-other-files", paths: others };
  const changed = await changedSinceLocked(session, state, locked);
  if (changed.length > 0) return { reason: "patch-changed", paths: changed };
  const applies = await git.run(["apply", "--check", "--recount", "-"], { input: patch });
  if (applies.code !== 0)
    return { reason: "patch-not-applying", detail: firstLine(applies.stderr) };
  return undefined;
}

/** The `locked` tests that are not, on disk, the version their hash locked. */
async function changedSinceLocked(
  session: Session,
  state: ChangeState,
  locked: readonly string[],
): Promise<string[]> {
  const versions = await Promise.all(
    locked.map(async (path) => {
      const text = await readText(join(session.root, path));
      return text !== undefined && hashText(text) === state.lockedTests?.[path] ? [] : [path];
    }),
  );
  return versions.flat();
}

/** The pieces of evidence `specs` name, as their lines are now; or why one does not do. */
async function readEvidence(
  session: Session,
  specs: readonly string[],
): Promise<{ readonly pieces: readonly UnlockEvidence[] } | UnlockRefusal> {
  if (specs.length > UNLOCK_LIMITS.evidence) {
    return { reason: "evidence-too-many", count: specs.length };
  }
  const pieces: UnlockEvidence[] = [];
  for (const spec of specs) {
    const piece = await readPiece(session, spec);
    if ("reason" in piece) return piece;
    pieces.push(piece);
  }
  return { pieces };
}

/** One piece of evidence: its form, its length, a file git tracks and lines it has. */
async function readPiece(session: Session, spec: string): Promise<UnlockEvidence | UnlockRefusal> {
  const parsed = /^(.+):(\d+)-(\d+)$/.exec(spec.trim());
  const path = normalizePath(parsed?.[1] ?? "");
  const from = Number(parsed?.[2]);
  const to = Number(parsed?.[3]);
  if (parsed === null || pathProblem(path) !== undefined || from < 1 || to < from) {
    return { reason: "evidence-format", evidence: spec };
  }
  const length = to - from + 1;
  if (length > UNLOCK_LIMITS.evidenceLines) {
    return { reason: "evidence-too-long", evidence: spec, lines: length };
  }
  const text = (await session.git.isTracked(path))
    ? await readText(join(session.root, path)).catch(() => undefined)
    : undefined;
  if (text === undefined) return { reason: "evidence-untracked", evidence: spec, path };
  const lines = linesOf(text);
  if (to > lines.length) {
    return { reason: "evidence-lines", evidence: spec, path, lines: lines.length };
  }
  return { path, from, to, text: lines.slice(from - 1, to).join("\n") };
}

/** The lines of `text`, without the empty one after its last newline. */
function linesOf(text: string): readonly string[] {
  const lines = text.split("\n");
  return lines.at(-1) === "" ? lines.slice(0, -1) : lines;
}

/** The first line `git apply` wrote, which says what is wrong. */
function firstLine(stderr: string): string {
  return stderr.trim().split("\n")[0] ?? "";
}
