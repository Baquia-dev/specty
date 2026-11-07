// SPDX-License-Identifier: Apache-2.0
import { availableParallelism } from "node:os";
import { processBudgetNote } from "@baquia-dev/specty-core";
import { availableMemory } from "../io/memory";
import type { Session } from "../session";

/** What a verification's command counts on: the machine's cores and memory, and its places of the clone. */
interface Share {
  readonly cores: number;
  /** The memory available on the machine as the command starts, in bytes (`availableMemory`). */
  readonly memory: number;
  /** What each process takes, in MiB: `verify.processes.memoryMiB`. */
  readonly memoryMiB: number;
  /** The places of `verify.slots` it holds: a task's 1, the full one's all (any number above). */
  readonly places: number;
  readonly slots: number;
}

const MIB = 1024 * 1024;

/** The places of the clone's `slots` a command holds: at least 1 and at most all of them. */
const heldOf = (places: number, slots: number): number => Math.min(Math.max(places, 1), slots);

/**
 * How many processes a verification's command may start: of its share of the clone's places, the
 * fewest of its cores and of the processes of `memoryMiB` that fit in its memory, rounded down and
 * never fewer than 1. With 2 places, a task's counts on half, the full one on all.
 */
export function processBudget({ cores, memory, memoryMiB, places, slots }: Share): number {
  const held = heldOf(places, slots);
  const byCores = Math.floor((cores * held) / slots);
  const byMemory = Math.floor((memory * held) / slots / (memoryMiB * MIB));
  return Math.max(1, Math.min(byCores, byMemory));
}

/** A positive whole number, written only with digits. */
const WHOLE = /^[1-9]\d*$/;

/**
 * The environment a verification's command starts with, as it starts, when it holds `places` of
 * the clone's `verify.slots` (`inSlots`): the session's, with each variable of
 * `verify.processes.env` set to its `processBudget` from the machine's cores and the memory
 * available then, unless it already holds a smaller positive whole number, the person's choice.
 * It says on the error output the number and what it comes from (`processBudgetNote`). Without
 * variables, the session's as it is, the memory is not measured and it says nothing. Each command
 * asks again, so the number is the one of the moment it starts, when the verifications already
 * running hold their memory.
 */
export async function budgetedEnv(session: Session, places: number): Promise<NodeJS.ProcessEnv> {
  const { env } = session.environment;
  const { processes, slots } = session.config.verify;
  if (processes.env.length === 0) return env;
  const cores = availableParallelism();
  const memory = await availableMemory(session.root, env);
  const { memoryMiB } = processes;
  const budget = processBudget({ cores, memory, memoryMiB, places, slots });
  const told = (value: string | undefined) =>
    value !== undefined && WHOLE.test(value) ? Math.min(Number(value), budget) : budget;
  const variables = processes.env.map((name) => ({ name, value: told(env[name]) }));
  const view = { budget, variables, memory, cores, places: heldOf(places, slots), slots };
  session.environment.io.err(processBudgetNote(view, session.lang));
  return {
    ...env,
    ...Object.fromEntries(variables.map(({ name, value }) => [name, String(value)])),
  };
}
