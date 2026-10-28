// SPDX-License-Identifier: Apache-2.0
// How the history reads the data of an `audit.jsonl` line and words its details. The lines come
// from disk and from older versions of the CLI, so every field is read with care.
import type { Bilingual } from "./records";

export type Data = Readonly<Record<string, unknown>>;

/** What kind of event an entry is, to filter the history by. */
export type HistoryType =
  | "spec"
  | "tasks"
  | "verifications"
  | "scope"
  | "adjustments"
  | "closing"
  | "other";

/** How the history tells an event: its type, its title and the details it could read. */
export interface Told {
  readonly type: HistoryType;
  readonly title: Bilingual;
  readonly details?: readonly (Bilingual | undefined)[];
}

export const both = (es: string, en: string): Bilingual => ({ es, en });
export const text = (data: Data, key: string) => {
  const value = data[key];
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
};
export const count = (data: Data, key: string) => {
  const value = data[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
};
const isString = (item: unknown): item is string => typeof item === "string";
export const texts = (data: Data, key: string): string[] => {
  const value = data[key];
  return Array.isArray(value) ? value.filter(isString) : [];
};
export const isData = (value: unknown): value is Data =>
  typeof value === "object" && value !== null && !Array.isArray(value);
/** Where the person decided, by the `channel` of the event. */
export const CHANNELS: Readonly<Record<string, Bilingual>> = {
  ui: both("Desde la UI", "From the UI"),
  tty: both("En la terminal", "In the terminal"),
  pr: both("En una pull request", "In a pull request"),
};
/** A detail only when its value is there. */
export const when = (value: string | undefined, say: (value: string) => Bilingual) =>
  value === undefined ? undefined : say(value);
export const plain = (value: string | undefined) => when(value, (said) => both(said, said));
/** «2 avisos» / «2 warnings»; nothing for none. */
export const counted = (n: number, es: string, en: string) =>
  n === 0 ? undefined : both(`${n} ${es}${n === 1 ? "" : "s"}`, `${n} ${en}${n === 1 ? "" : "s"}`);
/** «Empezó T1» / «Started T1», or «una tarea» when the event does not say which. */
export const onTask = (data: Data, es: string, en: string) => {
  const task = text(data, "task");
  return both(`${es} ${task ?? "una tarea"}`, `${en} ${task ?? "a task"}`);
};
