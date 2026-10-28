// SPDX-License-Identifier: Apache-2.0
import {
  type CiCommit,
  type CiFacts,
  isGoverned,
  parseSpec,
  shortHash,
  specHash,
} from "@baquia-dev/specty-core";
import { isRecord, parseJson } from "../io/files";
import type { Session } from "../session";
import { targetBranch } from "./worktree";

/**
 * What git says of the commits `specty ci` checks (ARCHITECTURE §10): the range `<base>..HEAD`
 * without merges, each commit's trailers and files, whether the change it names exists and, for
 * a task's commit, whether its spec was approved in that very commit.
 */

export interface CiOptions {
  /** Where the range starts; without it, the target branch. */
  readonly base?: string;
  /** The branch the commits go into; without it, the one `base` names. */
  readonly into?: string;
  /** The pull request's branch. */
  readonly headRef?: string;
}

const TRAILERS = ["Specty-Change", "Specty-Task", "Specty-Spec", "Specty-Init", "Specty-Kind"];
const FORMAT = `%x1e%h%x1f%s${TRAILERS.map((key) => `%x1f%(trailers:key=${key},valueonly,separator=%x2C)`).join("")}`;

/** One commit of the range as `git log` gives it. */
interface Logged {
  readonly sha: string;
  readonly subject: string;
  readonly trailers: Readonly<Record<string, string>>;
  readonly files: readonly string[];
}

export async function ciFacts(session: Session, options: CiOptions): Promise<CiFacts> {
  const target = session.config.git.target ?? (await targetBranch(session.git, undefined));
  const base = options.base ?? target;
  const logged = base === undefined ? [] : await rangeOf(session, base);
  const into =
    options.into ?? (options.base === undefined ? target : await branchOf(session, options.base));
  return {
    commits: await Promise.all(logged.map((entry) => factsOf(session, entry))),
    intoTarget: into === undefined || target === undefined || into === target,
    ...(options.headRef !== undefined ? { headRef: options.headRef } : {}),
  };
}

/** The commits of `<base>..HEAD` that are not merges, with both sides of each rename. */
async function rangeOf(session: Session, base: string): Promise<Logged[]> {
  const range = `${base}..HEAD`;
  const result = await session.git.run([
    "log",
    "--no-merges",
    "--no-renames",
    "--name-only",
    "-n",
    "1000",
    `--format=${FORMAT}`,
    range,
  ]);
  if (result.code !== 0) throw new Error(`git log ${range}: ${result.stderr.trim()}`);
  return result.stdout.split("\x1e").flatMap((record): Logged[] => {
    const [header = "", ...files] = record.split("\n");
    const [sha, subject, ...values] = header.split("\x1f").map((part) => part.trim());
    if (sha === undefined || sha === "") return [];
    const trailers = Object.fromEntries(
      TRAILERS.flatMap((key, index) => {
        const value = values[index];
        return value === undefined || value === "" ? [] : [[key, value]];
      }),
    );
    return [{ sha, subject: subject ?? "", trailers, files: files.filter((file) => file !== "") }];
  });
}

async function factsOf(session: Session, entry: Logged): Promise<CiCommit> {
  const { sha, subject, trailers } = entry;
  const governed = entry.files.filter(
    (path) => !path.startsWith(".specty/") && isGoverned(path, session.config),
  );
  const change = trailers["Specty-Change"];
  const task = trailers["Specty-Task"];
  // Only a commit of governed code is judged, so only its change is looked for.
  const known =
    change !== undefined && governed.length > 0 && (await changeExists(session, sha, change));
  const approval =
    known && change !== undefined && task !== undefined
      ? await approvalAt(session, sha, change, trailers["Specty-Spec"])
      : undefined;
  return {
    sha,
    subject,
    governed,
    ...(change !== undefined ? { change } : {}),
    ...(task !== undefined ? { task } : {}),
    init: trailers["Specty-Init"] === "true",
    spike: trailers["Specty-Kind"] === "spike",
    known,
    ...(approval !== undefined ? { approval } : {}),
  };
}

/** The change is in that commit or in HEAD: open in `.specty/changes/`, or archived. */
async function changeExists(session: Session, sha: string, id: string): Promise<boolean> {
  for (const rev of [sha, "HEAD"]) {
    if (await inTree(session, rev, `.specty/changes/${id}/state.json`)) return true;
    const years = await session.git.run(["ls-tree", "--name-only", rev, ".specty/archive/"]);
    for (const year of years.code === 0 ? years.stdout.split("\n") : []) {
      if (year !== "" && (await inTree(session, rev, `${year}/${id}/state.json`))) return true;
    }
  }
  return false;
}

async function inTree(session: Session, rev: string, path: string): Promise<boolean> {
  return (await session.git.run(["cat-file", "-e", `${rev}:${path}`])).code === 0;
}

/**
 * A task's commit, in that commit: the change's state has an approval, its spec's canonical form
 * gives that hash, and the commit's `Specty-Spec` (`r3@4be1c2d`) names it.
 */
async function approvalAt(
  session: Session,
  sha: string,
  id: string,
  trailer: string | undefined,
): Promise<"valid" | "missing" | "mismatch"> {
  const dir = `.specty/changes/${id}`;
  const [state, text] = await Promise.all([
    session.git.run(["show", `${sha}:${dir}/state.json`]),
    session.git.run(["show", `${sha}:${dir}/spec.md`]),
  ]);
  const parsed = state.code === 0 ? parseJson(state.stdout) : undefined;
  const approved = isRecord(parsed) && isRecord(parsed.approved) ? parsed.approved.hash : undefined;
  if (typeof approved !== "string" || text.code !== 0) return "missing";
  const spec = parseSpec(text.stdout, { language: session.lang }).spec;
  const named = trailer === undefined ? undefined : /@(\S+)$/.exec(trailer)?.[1];
  return specHash(spec) === approved && named === shortHash(approved) ? "valid" : "mismatch";
}

/**
 * The branch a ref names, local or remote-tracking, without its remote. A commit, a tag or `HEAD`
 * names none: where the commits go is then unknown.
 */
async function branchOf(session: Session, ref: string): Promise<string | undefined> {
  if (/^HEAD\b/.test(ref)) return undefined;
  const full = await session.git.run(["rev-parse", "--symbolic-full-name", ref]);
  const name = full.code === 0 ? full.stdout.trim() : "";
  return /^refs\/heads\/(.+)$/.exec(name)?.[1] ?? /^refs\/remotes\/[^/]+\/(.+)$/.exec(name)?.[1];
}
