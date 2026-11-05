// SPDX-License-Identifier: Apache-2.0
import {
  type FreshTarget,
  type FreshUnit,
  freshCard,
  freshMemoryText,
  freshProgressLine,
  freshRefusalCard,
  type Output,
} from "@baquia-dev/specty-core";
import type { Command } from "commander";
import { isFinished, resolveActive } from "../flow/active";
import { type Harvest, rememberEntries } from "../flow/archive-memory";
import { oneAtATime } from "../flow/full-verification";
import { fullCommand, type Printed, printsOf, record } from "../flow/units";
import { execute, tail } from "../io/exec";
import type { Session } from "../session";

type Run = (handler: (session: Session) => Promise<Output>) => () => Promise<void>;

/** The lines of a failed attempt's output that the card shows: its end is what matters. */
const SHOWN = 20;

/** A unit to run fresh: with `verify.units`, its fingerprint; `verify.full` has none. */
interface Fresh {
  readonly target: FreshTarget;
  readonly printed?: Printed;
}

/** One attempt at a unit. */
interface Attempt {
  readonly code: number | undefined;
  readonly ms: number;
  readonly output: readonly string[];
}

/**
 * Registers `specty verify --fresh` (ARCHITECTURE §6), which grants nothing: the agent and the
 * person run it from any folder of the clone. It changes no change's state, so it takes no lock.
 */
export function verifyCommand(program: Command, run: Run): void {
  program
    .command("verify")
    .description("run the full verification")
    .option(
      "--fresh",
      "every unit, without the record of those that passed; one that fails runs once more",
    )
    .action((options: { fresh?: boolean }) =>
      run((session) => verify(session, options.fresh === true))(),
    );
}

/**
 * `specty verify --fresh`: every unit of the full verification (or `verify.full` without units),
 * in order and without looking at the record, on the full verification's turn with every place of
 * the clone. One that fails runs once more: if it passes then, it is flaky and the memory keeps a
 * lesson of its paths; if it fails again, a pending item. Those that pass go into the record.
 */
async function verify(session: Session, fresh: boolean): Promise<Output> {
  if (!fresh) return freshRefusalCard({ reason: "no-flag" }, session.cards);
  const command = fullCommand(session.config);
  if (command === undefined) return freshRefusalCard({ reason: "no-verification" }, session.cards);
  const change = await openChange(session);
  const planned = await freshUnits(session, command);
  const ran = await oneAtATime(session, command, () => runAll(session, change, planned));
  const items = ran.units.flatMap((unit, index): Harvest[] => {
    if (unit.result === "passed") return [];
    const text = freshMemoryText(unit, unit.result, session.lang);
    const paths = unit.result === "flaky" ? planned[index]?.printed?.unit.paths : undefined;
    return [paths === undefined ? { text } : { text, paths }];
  });
  const remembered = await rememberEntries(session, change, items);
  return freshCard({ ...ran, remembered }, session.cards);
}

/** What runs fresh: each unit of `verify.units` with its fingerprint, or `verify.full` alone. */
async function freshUnits(session: Session, command: string): Promise<Fresh[]> {
  const { units } = session.config.verify;
  if (units === undefined) return [{ target: { command } }];
  return (await printsOf(session, units)).map((printed) => ({
    target: { name: printed.unit.name, command: printed.unit.command },
    printed,
  }));
}

/**
 * Runs each of `units` in order, every one even after one fails twice, and once more the one
 * that fails; each that passes, at the first attempt or the second, goes into the record.
 */
async function runAll(
  session: Session,
  change: string | undefined,
  units: readonly Fresh[],
): Promise<{ readonly units: FreshUnit[]; readonly recorded: string[] }> {
  const ran: FreshUnit[] = [];
  const recorded: string[] = [];
  for (const { target, printed } of units) {
    const first = await attempt(session, target, false);
    const second = first.code === 0 ? undefined : await attempt(session, target, true);
    const unit = freshUnit(target, first, second);
    ran.push(unit);
    if (unit.result === "failed" || printed?.print === undefined) continue;
    await record(session, printed, change, (second ?? first).ms);
    recorded.push(printed.unit.name);
  }
  return { units: ran, recorded };
}

/** Runs `target` once, as a verification runs: through the shell, by its time and below the rest. */
async function attempt(session: Session, target: FreshTarget, again: boolean): Promise<Attempt> {
  session.environment.io.err(freshProgressLine(target, again, session.lang));
  const started = Date.now();
  const result = await execute(target.command, [], {
    cwd: session.root,
    shell: true,
    env: session.environment.env,
    timeoutMs: session.config.verify.timeoutSec * 1000,
    lowPriority: true,
  });
  return { code: result.code, ms: Date.now() - started, output: tail(result, SHOWN) };
}

/** What became of `target`: passed at the first attempt, flaky, or failed twice. */
function freshUnit(target: FreshTarget, first: Attempt, second: Attempt | undefined): FreshUnit {
  if (second === undefined) return { ...target, result: "passed", ms: [first.ms], output: [] };
  const flaky = second.code === 0;
  return {
    ...target,
    result: flaky ? "flaky" : "failed",
    ms: [first.ms, second.ms],
    output: (flaky ? first : second).output,
  };
}

/** The open change of this folder, if any: the origin of what the memory keeps. */
async function openChange(session: Session): Promise<string | undefined> {
  const active = await resolveActive(session);
  return active === undefined || isFinished(active.state) ? undefined : active.state.id;
}
