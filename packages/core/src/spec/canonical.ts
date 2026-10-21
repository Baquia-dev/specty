// SPDX-License-Identifier: Apache-2.0
import { hashText, type Sha256Hash } from "../hash";
import type { Spec } from "./model";
import { type ParseOptions, type ParseResult, parseSpec } from "./parse";
import { hashUnits, serializeSpec } from "./serialize";

export interface CanonicalResult extends ParseResult {
  /** Canonical text: what Specty writes back to `spec.md` on `propose`. */
  readonly text: string;
  readonly hash: Sha256Hash;
}

/** Parses a spec and returns its canonical text and revision hash. */
export function canonicalize(text: string, options: ParseOptions = {}): CanonicalResult {
  const parsed = parseSpec(text, options);
  return { ...parsed, text: serializeSpec(parsed.spec), hash: specHash(parsed.spec) };
}

/**
 * Revision hash: SHA-256 of the canonical text with every task unchecked, so marking
 * tasks as done never invalidates an approval.
 */
export function specHash(spec: Spec): Sha256Hash {
  return hashText(serializeSpec(withPendingTasks(spec)));
}

/** Hash of every unit (frontmatter, title, sections, items, files), used for deltas. */
export function itemHashes(spec: Spec): ReadonlyMap<string, Sha256Hash> {
  return new Map([...hashUnits(spec)].map(([key, text]) => [key, hashText(text)] as const));
}

export function withPendingTasks(spec: Spec): Spec {
  const tasks = spec.sections.tasks;
  if (tasks === undefined) return spec;
  const items = tasks.items.map((task) => ({ ...task, done: false }));
  return { ...spec, sections: { ...spec.sections, tasks: { ...tasks, items } } };
}
