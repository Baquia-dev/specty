// SPDX-License-Identifier: Apache-2.0
import { availableParallelism } from "node:os";
import type { Session } from "../session";

/** What a verification's command counts on: the machine's cores and its places of the clone. */
interface Share {
  readonly cores: number;
  /** The places of `verify.slots` it holds: a task's 1, the full one's all (any number above). */
  readonly places: number;
  readonly slots: number;
}

/**
 * How many processes a verification's command may start: the cores of its share of the clone's
 * places, rounded down and never fewer than 1. With 2 places, a task's gets half, the full one all.
 */
export function processBudget({ cores, places, slots }: Share): number {
  const held = Math.min(Math.max(places, 1), slots);
  return Math.max(1, Math.floor((cores * held) / slots));
}

/** A positive whole number, written only with digits. */
const WHOLE = /^[1-9]\d*$/;

/**
 * The environment a verification's command starts with, as it starts, when it holds `places` of
 * the clone's `verify.slots` (`inSlots`): the session's, with each variable of
 * `verify.processes.env` set to its `processBudget` from the machine's cores, unless it already
 * holds a smaller positive whole number, the person's choice. Without variables, the session's as
 * it is. Each command asks again, so the number is the one of the moment it starts.
 */
export async function budgetedEnv(session: Session, places: number): Promise<NodeJS.ProcessEnv> {
  const { env } = session.environment;
  const { processes, slots } = session.config.verify;
  if (processes.env.length === 0) return env;
  const budget = processBudget({ cores: availableParallelism(), places, slots });
  const told = (value: string | undefined) =>
    value !== undefined && WHOLE.test(value) ? Math.min(Number(value), budget) : budget;
  return {
    ...env,
    ...Object.fromEntries(processes.env.map((name) => [name, String(told(env[name]))])),
  };
}
