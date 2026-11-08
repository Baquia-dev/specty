// SPDX-License-Identifier: Apache-2.0
// Specty's switch in the prototype: on, after the sample's reviewer turned it off for a while
// yesterday, and each change the person makes, added at the top of its log.
import type { SpectySwitch } from "./records";
import { REVIEWER } from "./sample-records";

const HOUR = 3_600_000;

/** The sample's switch at `now`: on since yesterday, off for two hours before that. */
export function sampleSwitch(now: number = Date.now()): SpectySwitch {
  const at = (hours: number) => new Date(now - hours * HOUR).toISOString();
  const last = { on: true, by: REVIEWER, at: at(22) };
  return { ...last, log: [last, { on: false, by: REVIEWER, at: at(24) }] };
}

/** `current` turned `on` by the sample's reviewer at `now`; the state it already has, as it is. */
export function turnedSwitch(current: SpectySwitch, on: boolean, now: number): SpectySwitch {
  if (current.on === on) return current;
  const entry = { on, by: REVIEWER, at: new Date(now).toISOString() };
  return { ...entry, log: [entry, ...current.log] };
}
