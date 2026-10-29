// SPDX-License-Identifier: Apache-2.0
import type { WhyCommit } from "@baquia-dev/specty-core";
import { ChangeSpecs, logged } from "../flow/traced";
import { MAX_OUTPUT } from "../io/exec";
import type { Session } from "../session";
import { SPECTY_DIR } from "../store/paths";
import { changeRange } from "./diff";

/** Lines of a file, from `start` to `end` (from 1), that come in a row from the same commit. */
interface TraceBlock {
  readonly start: number;
  readonly end: number;
  /** As `specty why` tells it: the commit and, when Specty made it, its change, task and criteria. */
  readonly commit: WhyCommit;
}

/** A file as the change left it, at `commit`, the one of its last task. */
interface Trace {
  readonly path: string;
  readonly commit: string;
  readonly lines: readonly string[];
  readonly blocks: readonly TraceBlock[];
}

type TraceAnswer =
  | { readonly kind: "files"; readonly files: readonly string[] }
  | { readonly kind: "trace"; readonly trace: Trace }
  | { readonly kind: "missing" }
  | { readonly kind: "too-large" }
  | { readonly kind: "failed" };

/**
 * The traceability of change `id` (docs/ui.md, Historial): without `path`, the files it left; with
 * one of them, its lines as the change left them, in blocks with what `specty why` tells of each.
 * It reads no file the change did not leave.
 */
export async function changeTrace(
  session: Session,
  id: string,
  path?: string,
): Promise<TraceAnswer> {
  const range = await changeRange(session, id);
  if (range === undefined) return { kind: "missing" };
  const files = await leftFiles(session, range);
  if (files === undefined) return { kind: "failed" };
  if (path === undefined) return { kind: "files", files };
  if (!files.includes(path)) return { kind: "missing" };
  const blamed = await session.git.run(["blame", "--porcelain", range.to, "--", path]);
  if (blamed.code !== 0) return { kind: "failed" };
  // The same limit as the diff: more would not be read in a browser either.
  if (blamed.stdout.length >= MAX_OUTPUT) return { kind: "too-large" };
  const { lines, owners } = blameOf(blamed.stdout);
  const commits = await commitsOf(session, [...new Set(owners)]);
  const trace = { path, commit: range.to, lines, blocks: blocksOf(owners, commits) };
  return { kind: "trace", trace };
}

/** How the local server answers: the status and its JSON. */
export function traceReply(answer: TraceAnswer): {
  readonly status: number;
  readonly body: string;
} {
  switch (answer.kind) {
    case "files":
      return { status: 200, body: JSON.stringify({ files: answer.files }) };
    case "trace":
      return { status: 200, body: JSON.stringify(answer.trace) };
    case "missing":
      return { status: 404, body: '{"error":"not found"}' };
    case "too-large":
      return { status: 413, body: '{"error":"too large"}' };
    case "failed":
      return { status: 500, body: '{"error":"git"}' };
  }
}

/** The files the change left, added, modified or renamed, outside `.specty/`. */
async function leftFiles(
  session: Session,
  range: { readonly from: string; readonly to: string },
): Promise<string[] | undefined> {
  const result = await session.git.run([
    "diff",
    "--name-only",
    "-z",
    "-M",
    "--diff-filter=d",
    range.from,
    range.to,
    "--",
    ".",
    `:(exclude)${SPECTY_DIR}`,
  ]);
  if (result.code !== 0) return undefined;
  return result.stdout.split("\0").filter((file) => file.length > 0);
}

/** The lines of `git blame --porcelain`, each with the full hash of the commit it comes from. */
function blameOf(output: string): { lines: string[]; owners: string[] } {
  const lines: string[] = [];
  const owners: string[] = [];
  let owner = "";
  for (const line of output.split("\n")) {
    const header = /^([0-9a-f]{40,64}) \d+ \d+/.exec(line)?.[1];
    if (header !== undefined) owner = header;
    else if (line.startsWith("\t")) {
      lines.push(line.slice(1));
      owners.push(owner);
    }
  }
  return { lines, owners };
}

/** Each commit, by its full hash, as `specty why` tells it: read from git all at once. */
async function commitsOf(
  session: Session,
  hashes: readonly string[],
): Promise<ReadonlyMap<string, WhyCommit>> {
  if (hashes.length === 0) return new Map();
  const found = await logged(session, ["--no-walk", ...hashes]);
  const specs = new ChangeSpecs(session);
  const told = new Map<string, WhyCommit>();
  for (const hash of hashes) {
    const commit = found.find((item) => hash.startsWith(item.hash));
    if (commit !== undefined) told.set(hash, await specs.of(commit));
  }
  return told;
}

/** The lines in a row from the same commit, as one block each. */
function blocksOf(
  owners: readonly string[],
  commits: ReadonlyMap<string, WhyCommit>,
): TraceBlock[] {
  const blocks: (TraceBlock & { readonly owner: string })[] = [];
  owners.forEach((owner, index) => {
    const commit = commits.get(owner);
    const last = blocks.at(-1);
    if (commit === undefined) return;
    if (last?.owner === owner && last.end === index) {
      blocks[blocks.length - 1] = { ...last, end: index + 1 };
    } else {
      blocks.push({ owner, start: index + 1, end: index + 1, commit });
    }
  });
  return blocks.map(({ owner: _, ...block }) => block);
}
