// SPDX-License-Identifier: Apache-2.0
// Commits read back with their Specty trailers, and the change, task and criteria behind them:
// what `specty why` tells of a line or a file, and the local server of each block of a file.
import { parseSpec, type WhyCommit } from "@baquia-dev/specty-core";
import type { Session } from "../session";
import { readSpec, type StoredChange } from "../store/changes";
import { findChange } from "./find";

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

export interface LoggedCommit {
  readonly hash: string;
  readonly date: string;
  readonly author: string;
  readonly subject: string;
  readonly trailers: { readonly change?: string; readonly task?: string; readonly spec?: string };
}

/** The commits `git log <args>` gives, newest first, each with its Specty trailers. */
export async function logged(session: Session, args: readonly string[]): Promise<LoggedCommit[]> {
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
export class ChangeSpecs {
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
