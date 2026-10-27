// SPDX-License-Identifier: Apache-2.0
import {
  type Output,
  parseSpec,
  type WhyCommit,
  whyCard,
  whyRefusalCard,
} from "@baquia-dev/specty-core";
import { findChange } from "../flow/find";
import type { Session } from "../session";
import { readSpec, type StoredChange } from "../store/changes";

/** How many entries `why` lists for a file: one per change, the most recent ones. */
const MAX_ENTRIES = 10;

/** A commit, field by field, with its Specty trailers: one per record of `git log`. */
const FORMAT = [
  "%h",
  "%ad",
  "%an",
  "%s",
  ...["Specty-Change", "Specty-Task", "Specty-Spec"].map(
    (key) => `%(trailers:key=${key},valueonly,separator=%x2C)`,
  ),
].join("%x00");

/**
 * `specty why <path>[:<line>]` (ARCHITECTURE §13): blame, commit, trailers, and the change, task
 * and criteria behind a line; for a file, the changes that touched it, newest first. It only
 * reads, so the agent may run it too.
 */
export async function why(session: Session, target: string): Promise<Output> {
  const [, file = target, number] = /^(.*?)(?::(\d+))?$/.exec(target) ?? [];
  const noHistory = () => whyRefusalCard({ reason: "no-history", file }, session.cards);
  const changes = new ChangeSpecs(session);
  if (number !== undefined) {
    const blamed = await session.git.run([
      "blame",
      "--porcelain",
      "-L",
      `${number},${number}`,
      "--",
      file,
    ]);
    // By the file's history, not by git's message, which a translated git words otherwise.
    if (blamed.code !== 0) {
      return (await logged(session, ["-1", "--", file])).length > 0
        ? whyRefusalCard({ reason: "no-line", file, line: number }, session.cards)
        : noHistory();
    }
    const hash = blamed.stdout.split(" ")[0] ?? "";
    // A line not committed yet is blamed on the zero hash.
    if (/^0+$/.test(hash))
      return whyCard({ target, uncommitted: true, commits: [] }, session.cards);
    const [commit] = await logged(session, ["-1", hash]);
    return whyCard(
      { target, commits: commit === undefined ? [] : [await changes.of(commit)] },
      session.cards,
    );
  }
  const history = await logged(session, ["--", file]);
  if (history.length === 0) return noHistory();
  // One entry per change, its newest commit; each commit outside Specty on its own.
  const seen = new Set<string>();
  const entries = history.filter((commit) => {
    const key = commit.trailers.change ?? commit.hash;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const commits = await Promise.all(
    entries.slice(0, MAX_ENTRIES).map((commit) => changes.of(commit)),
  );
  return whyCard({ target, commits }, session.cards);
}

interface LoggedCommit {
  readonly hash: string;
  readonly date: string;
  readonly author: string;
  readonly subject: string;
  readonly trailers: { readonly change?: string; readonly task?: string; readonly spec?: string };
}

/** The commits `git log <args>` gives, newest first, each with its Specty trailers. */
async function logged(session: Session, args: readonly string[]): Promise<LoggedCommit[]> {
  const result = await session.git.run(["log", `--format=${FORMAT}%x1e`, "--date=short", ...args]);
  if (result.code !== 0) return [];
  return result.stdout.split("\x1e").flatMap((record): LoggedCommit[] => {
    const [hash, date, author, subject, ...values] = record.trim().split("\0");
    if (hash === undefined || hash === "") return [];
    const [change, task, spec] = values.map((value) => value.trim());
    return [
      {
        hash,
        date: date ?? "",
        author: author ?? "",
        subject: subject ?? "",
        trailers: {
          ...(change ? { change } : {}),
          ...(task ? { task } : {}),
          ...(spec ? { spec } : {}),
        },
      },
    ];
  });
}

/** The changes commits belong to, found once each: open in any worktree, or archived. */
class ChangeSpecs {
  private readonly found = new Map<string, Promise<StoredChange | undefined>>();

  constructor(private readonly session: Session) {}

  /** The commit as the why card shows it: with its change, task and criteria, when they are here. */
  async of(commit: LoggedCommit): Promise<WhyCommit> {
    const { hash, date, author, subject, trailers } = commit;
    const base = { commit: hash, date, author, subject };
    if (trailers.change === undefined) return base;
    const stored = await this.load(trailers.change);
    const spec =
      stored === undefined
        ? undefined
        : parseSpec(await readSpec(stored.files), { language: this.session.lang }).spec;
    const task = spec?.sections.tasks?.items.find((item) => item.id === trailers.task);
    const covered = task?.ac === undefined || task.ac === "none" ? [] : task.ac;
    const criteria = (spec?.sections.criteria?.items ?? []).filter((item) =>
      covered.includes(item.id),
    );
    return {
      ...base,
      change: {
        id: trailers.change,
        ...(spec === undefined ? {} : { title: spec.title }),
        ...(trailers.task === undefined
          ? {}
          : { task: { id: trailers.task, ...(task === undefined ? {} : { title: task.title }) } }),
        criteria: criteria.map(({ id, text }) => ({ id, text })),
        ...(trailers.spec === undefined ? {} : { spec: trailers.spec }),
      },
    };
  }

  private load(id: string): Promise<StoredChange | undefined> {
    const cached = this.found.get(id);
    if (cached !== undefined) return cached;
    const loading = findChange(this.session, id);
    this.found.set(id, loading);
    return loading;
  }
}
