// SPDX-License-Identifier: Apache-2.0
import {
  type CoverageGap,
  hashText,
  isGoverned,
  type ResolvedConfig,
} from "@baquia-dev/specty-core";
import { changeCoverage } from "../check/coverage";
import { checkContext } from "../check/files";
import { isRecord } from "../io/files";
import type { Session } from "../session";
import { appendAudit, type StoredChange } from "../store/changes";
import { auditEntry } from "./active";
import { type Audit, dataOf, readAudit } from "./carried";

/** A finished run of the full verification: its non-empty output lines, oldest first. */
export interface FullRun {
  readonly command: string;
  /** When it started (`Date.now()`): the coverage reports it left are the ones written since. */
  readonly started: number;
  /** Exit code; undefined when the process was killed (timeout or signal). */
  readonly code: number | undefined;
  readonly ms: number;
  readonly output: readonly string[];
  /** The code it ran on (`codeTree`), when it could be read. */
  readonly tree?: string;
}

/** The coverage of the lines the change adds that a full verification measured (formats.md §4). */
export interface VerifiedCoverage {
  readonly measured: number;
  readonly covered: number;
  /** The first stretches no test ran. */
  readonly gaps: readonly CoverageGap[];
  /** How many stretches no test ran. */
  readonly stretches: number;
}

/** The stretches the audit keeps: as many as the acceptance lists. */
const KEPT_GAPS = 5;

/**
 * The full verification's result in the audit (`change.verified`, formats.md §4), as
 * `task.verified` keeps a task's: command, exit code, duration and, if it failed, its last lines.
 * Also the coverage of what the change adds, when the run left a report that measures it: that
 * coverage is what it returns. Measuring never stops the record.
 */
export async function recordFullVerification(
  session: Session,
  change: StoredChange,
  run: FullRun,
): Promise<VerifiedCoverage | undefined> {
  const coverage = await measuredCoverage(session, run.started).catch(() => undefined);
  await appendAudit(
    change.files,
    await auditEntry(session, "specty", "change.verified", {
      cmd: run.command,
      exit: run.code ?? null,
      ms: run.ms,
      ...(run.tree === undefined ? {} : { tree: run.tree }),
      ...(run.code === 0 ? {} : { outputTail: run.output.slice(-10) }),
      ...(coverage === undefined ? {} : { coverage }),
    }),
  );
  return coverage;
}

/**
 * The coverage of the lines the change adds, from the reports written since `started`. With a
 * merge of the target branch in progress the lines count from the commit that comes in, so the
 * ones it brings are not the change's.
 */
async function measuredCoverage(
  session: Session,
  started: number,
): Promise<VerifiedCoverage | undefined> {
  const merging = await session.git.run(["rev-parse", "-q", "--verify", "MERGE_HEAD"]);
  const from = merging.code === 0 ? merging.stdout.trim() : undefined;
  const context = await checkContext(session, "changed", from);
  const { measured, covered, gaps } = await changeCoverage({ ...context, started });
  if (measured === 0) return undefined;
  return { measured, covered, gaps: gaps.slice(0, KEPT_GAPS), stretches: gaps.length };
}

/**
 * The coverage the last full verification that passed recorded, if it ran on the code there is
 * now: one on other code no longer describes the change.
 */
export async function coverageOnThisCode(
  session: Session,
  audit: Audit,
): Promise<VerifiedCoverage | undefined> {
  const data = dataOf(
    audit.findLast((entry) => entry.event === "change.verified" && dataOf(entry).exit === 0),
  );
  const coverage = coverageOf(data.coverage);
  if (coverage === undefined || typeof data.tree !== "string") return undefined;
  return data.tree === (await codeTree(session)) ? coverage : undefined;
}

/** A `coverage` read back from the audit, if it has the shape it was written with. */
function coverageOf(value: unknown): VerifiedCoverage | undefined {
  if (!isRecord(value)) return undefined;
  const { measured, covered, gaps, stretches } = value;
  if (typeof measured !== "number" || typeof covered !== "number") return undefined;
  if (typeof stretches !== "number" || !Array.isArray(gaps)) return undefined;
  const read = gaps.flatMap((gap: unknown): CoverageGap[] =>
    isRecord(gap) &&
    typeof gap.path === "string" &&
    typeof gap.from === "number" &&
    typeof gap.to === "number"
      ? [{ path: gap.path, from: gap.from, to: gap.to }]
      : [],
  );
  return { measured, covered, gaps: read, stretches };
}

/**
 * Whether the full verification `command` need not run again: its last run, alone or after
 * `verify.quick` in a task, passed on the code there is now. Then where it ran: the task, or none
 * for a full run of `accept` or of the UI. Undefined when it must run.
 */
export async function passedOnThisCode(
  session: Session,
  change: StoredChange,
  command: string,
): Promise<{ readonly task?: string } | undefined> {
  const { quick } = session.config.verify;
  const commands = new Set([command, ...(quick === undefined ? [] : [`${quick} && ${command}`])]);
  const last = (await readAudit(change.files)).findLast(
    (entry) =>
      (entry.event === "task.verified" || entry.event === "change.verified") &&
      commands.has(String(dataOf(entry).cmd)),
  );
  const data = dataOf(last);
  if (data.exit !== 0 || typeof data.tree !== "string") return undefined;
  if (data.tree !== (await codeTree(session))) return undefined;
  return typeof data.task === "string" ? { task: data.task } : {};
}

/**
 * The code a verification runs on: the working tree's code files, without `.specty/`, whose files
 * change with every record, nor the free ones of `ignored`, such as the documentation. A hash of
 * their paths and contents, taken without touching the index; undefined when git cannot tell.
 */
export async function codeTree(session: Session): Promise<string | undefined> {
  try {
    const tree = await session.git.treeWith(["."]);
    const listed = await session.git.run(["ls-tree", "-r", "-z", tree]);
    if (listed.code !== 0) return undefined;
    const entries = listed.stdout
      .split("\0")
      .filter(
        (entry) => entry !== "" && isCode(entry.slice(entry.indexOf("\t") + 1), session.config),
      );
    return hashText(entries.join("\n"));
  } catch {
    return undefined;
  }
}

/**
 * Whether the working tree has code that `target` does not, also code not committed yet: false
 * when the change touches only free files, so that its code is `target`'s. When git cannot tell,
 * it does, and the verification runs.
 */
export async function touchesCode(session: Session, target: string): Promise<boolean> {
  try {
    const tree = await session.git.treeWith(["."]);
    const diff = await session.git.run(["diff", "--name-only", "--no-renames", "-z", target, tree]);
    if (diff.code !== 0) return true;
    return diff.stdout.split("\0").some((path) => path !== "" && isCode(path, session.config));
  } catch {
    return true;
  }
}

/**
 * Whether a file is code, which a verification reads: any outside `.specty/` and `ignored`, even
 * one outside `governed`, such as a manifest.
 */
function isCode(path: string, config: Pick<ResolvedConfig, "ignored">): boolean {
  return isGoverned(path, { governed: ["**"], ignored: config.ignored });
}
