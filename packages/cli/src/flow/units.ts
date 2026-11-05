// SPDX-License-Identifier: Apache-2.0
import {
  hashText,
  isGoverned,
  type ResolvedConfig,
  type UnitsOutcome,
  type UnitTime,
  type VerifyUnit,
} from "@baquia-dev/specty-core";
import { tail } from "../io/exec";
import { exists, writeText } from "../io/files";
import type { Session } from "../session";
import { oneAtATime } from "./full-verification";
import { runLive } from "./live-run";
import { workingFiles } from "./verified";

/**
 * The clone's record of the units that passed (formats.md §1): one file per fingerprint, shared
 * by every worktree.
 */
const RECORD = "common/specty/verified";

/** A unit with the fingerprint of the code it reads; none when git cannot tell, and then it runs. */
interface Printed {
  readonly unit: VerifyUnit;
  readonly print: string | undefined;
}

/** The full verification to run (formats.md §6). */
export interface FullPlan {
  /** Its command (`fullCommand`). */
  readonly command: string;
  /** What runs: the command or, with `verify.units`, those of the units that have not passed. */
  readonly runs: string;
  /** With `verify.units`: the names of those that passed already on this code, and the others. */
  readonly units?: { readonly reused: readonly string[]; readonly pending: readonly Printed[] };
}

/** What a full verification did. */
export interface FullRan {
  /** 0 when it passed; otherwise the code of what failed, undefined when it was cut. */
  readonly code: number | undefined;
  /** The non-empty lines of the output of what ran last: the unit that failed, if one did. */
  readonly output: readonly string[];
  /** The command that ran last: the unit that failed, if one did. */
  readonly command: string;
  /** With `verify.units`, what each unit did. */
  readonly units?: UnitsOutcome;
}

/**
 * The command of the full verification: `verify.full` or, with `verify.units`, the commands of
 * every unit joined with `&&`, which do the same; none without either.
 */
export function fullCommand(config: Pick<ResolvedConfig, "verify">): string | undefined {
  const { units, full } = config.verify;
  return units === undefined ? full : joined(units);
}

/**
 * The full verification with `command` to run: with `verify.units`, only the units that have not
 * passed with the fingerprint of the code there is now, in this change or in another of the clone.
 */
export async function fullPlan(session: Session, command: string): Promise<FullPlan> {
  const { units } = session.config.verify;
  if (units === undefined) return { command, runs: command };
  const printed = await printsOf(session, units);
  const passed = await Promise.all(printed.map(({ print }) => passedBefore(session, print)));
  const reused = printed.filter((_, index) => passed[index]).map(({ unit }) => unit.name);
  const pending = printed.filter((_, index) => !passed[index]);
  return { command, runs: joined(pending.map(({ unit }) => unit)), units: { reused, pending } };
}

/**
 * Runs the full verification of `plan` for change `change`, live: its command or, with units,
 * those that have not passed, in order and on one turn with every place of the clone. `onStart`
 * hears when it starts, once it has the turn.
 */
export async function runFull(
  session: Session,
  change: string,
  plan: FullPlan,
  onStart: () => void,
): Promise<FullRan> {
  if (plan.units === undefined) {
    const result = await runLive(session, change, undefined, plan.command, { onStart });
    return { code: result.code, output: tail(result), command: plan.command };
  }
  const { reused, pending } = plan.units;
  return oneAtATime(session, plan.runs, () => {
    onStart();
    return runUnits(session, change, reused, pending);
  });
}

/**
 * Runs the `pending` units in order, each live and on the turn this process holds; another
 * session may have passed one meanwhile, and then it is reused. The first that fails stops the
 * rest; each that passes goes into the record.
 */
async function runUnits(
  session: Session,
  change: string,
  reused: readonly string[],
  pending: readonly Printed[],
): Promise<FullRan> {
  const again = [...reused];
  const passed: UnitTime[] = [];
  let last: FullRan = { code: 0, output: [], command: "" };
  for (const [index, { unit, print }] of pending.entries()) {
    if (await passedBefore(session, print)) {
      again.push(unit.name);
      continue;
    }
    const started = Date.now();
    const result = await runLive(session, change, undefined, unit.command, { held: true });
    const time = { name: unit.name, ms: Date.now() - started };
    last = { code: result.code, output: tail(result), command: unit.command };
    if (result.code !== 0) {
      const skipped = pending.slice(index + 1).map((next) => next.unit.name);
      return { ...last, units: { reused: again, passed, failed: time, skipped } };
    }
    await record(session, { unit, print }, change, time.ms);
    passed.push(time);
  }
  return { ...last, units: { reused: again, passed, skipped: [] } };
}

/**
 * The fingerprint of each unit: a hash of its command and of the files of the working tree that
 * match its `paths`, outside `.specty/`, with their paths and contents, also those not committed.
 */
async function printsOf(session: Session, units: readonly VerifyUnit[]): Promise<Printed[]> {
  const files = await workingFiles(session);
  return units.map((unit) => {
    if (files === undefined) return { unit, print: undefined };
    const read = files.filter(({ path }) =>
      isGoverned(path, { governed: unit.paths, ignored: [] }),
    );
    return { unit, print: hashText([unit.command, ...read.map(({ entry }) => entry)].join("\n")) };
  });
}

/** Whether a unit with this fingerprint passed already in the clone. */
async function passedBefore(session: Session, print: string | undefined): Promise<boolean> {
  return print !== undefined && (await exists(await recordPath(session, print)));
}

/** Puts a unit that passed into the clone's record, unless git could not tell its fingerprint. */
async function record(session: Session, printed: Printed, change: string, ms: number) {
  if (printed.print === undefined) return;
  const { name, command } = printed.unit;
  const at = session.environment.now().toISOString();
  const entry = { unit: name, command, change, at, ms };
  await writeText(await recordPath(session, printed.print), `${JSON.stringify(entry)}\n`);
}

const recordPath = (session: Session, print: string) =>
  session.git.gitPath(`${RECORD}/${print.replace(/^sha256:/, "")}.json`);

const joined = (units: readonly VerifyUnit[]) => units.map(({ command }) => command).join(" && ");
