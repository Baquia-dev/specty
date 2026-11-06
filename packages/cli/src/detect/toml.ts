// SPDX-License-Identifier: Apache-2.0
import { parse } from "smol-toml";
import { isRecord, readText } from "../io/files";

/** A TOML table, as the workspace detectors read it. */
export type Table = Readonly<Record<string, unknown>>;

/** The tables of the TOML file at `path`; undefined when it is missing or cannot be read. */
export async function readToml(path: string): Promise<Table | undefined> {
  const text = await readText(path);
  if (text === undefined) return undefined;
  try {
    return parse(text);
  } catch {
    return undefined;
  }
}

/** `value` when it is a table. */
export function table(value: unknown): Table | undefined {
  return isRecord(value) ? value : undefined;
}

/** The strings of `value` when it is an array; none otherwise. */
export function strings(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}
