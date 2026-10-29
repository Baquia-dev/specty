// SPDX-License-Identifier: Apache-2.0
import { parseSpec } from "@baquia-dev/specty-core";
import { MAX_OUTPUT } from "../io/exec";
import type { Session } from "../session";
import { SPECTY_DIR } from "../store/paths";
import { changeRecords } from "./records";

/** A diff for the UI, or why there is none. */
export type DiffAnswer =
  | { readonly kind: "diff"; readonly text: string }
  | { readonly kind: "missing" }
  | { readonly kind: "too-large"; readonly range: string }
  | { readonly kind: "failed" };

/**
 * The commits change `id` spans: from where its first task with a commit started to the commit of
 * its last one or, of `task`, its own. Nothing before a task has a commit. Every worktree shares
 * git's objects, so any of them will do.
 */
export async function changeRange(
  session: Session,
  id: string,
  task?: string,
): Promise<{ readonly from: string; readonly to: string } | undefined> {
  const record = (await changeRecords(session)).find((item) => item.state.id === id);
  if (record === undefined) return undefined;
  const { tasks } = record.state;
  const { spec } = parseSpec(record.spec, { language: session.lang });
  const committed = (spec.sections.tasks?.items ?? []).flatMap((item) => {
    const stored = tasks[item.id];
    return stored?.commit === undefined ? [] : [{ id: item.id, ...stored }];
  });
  const chosen = task === undefined ? undefined : committed.find((item) => item.id === task);
  const [from, to] =
    task === undefined
      ? [committed[0]?.baseCommit, committed.at(-1)?.commit]
      : [chosen?.baseCommit, chosen?.commit];
  return from === undefined || to === undefined ? undefined : { from, to };
}

/**
 * The diff of `task` of change `id` or, with none, of the whole change, the range the UI shows.
 * Specty's own files stay out: the view shows the code.
 */
export async function changeDiff(session: Session, id: string, task?: string): Promise<DiffAnswer> {
  const range = await changeRange(session, id, task);
  if (range === undefined) return { kind: "missing" };
  const { from, to } = range;
  const result = await session.git.run([
    "diff",
    "-M",
    "--no-color",
    "--no-ext-diff",
    "--src-prefix=a/",
    "--dst-prefix=b/",
    from,
    to,
    "--",
    ".",
    `:(exclude)${SPECTY_DIR}`,
  ]);
  if (result.code !== 0) return { kind: "failed" };
  // `execute` keeps the end of a longer output: the diff would start in the middle.
  if (result.stdout.length >= MAX_OUTPUT) return { kind: "too-large", range: `${from}..${to}` };
  return { kind: "diff", text: result.stdout };
}
