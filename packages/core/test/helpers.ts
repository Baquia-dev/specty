// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_CONFIG,
  type Diagnostic,
  parseSpec,
  type ResolvedConfig,
  type Spec,
  type ValidationContext,
  validateSpec,
} from "../src";

export const FIXTURES = [
  "standard.es.md",
  "quick.en.md",
  "spike.es.md",
  "retro.es.md",
  "epic.en.md",
];

export function fixture(name: string): string {
  return readFileSync(join(import.meta.dirname, "fixtures", name), "utf8");
}

export function specOf(text: string): Spec {
  return parseSpec(text).spec;
}

export function withConfig(overrides: Partial<ResolvedConfig>): ResolvedConfig {
  return { ...DEFAULT_CONFIG, ...overrides };
}

/** Parses and validates; returns `code:target` pairs so tests read well. */
export function check(text: string, ctx: Partial<ValidationContext> = {}): string[] {
  const parsed = parseSpec(text);
  const context: ValidationContext = {
    phase: "draft",
    config: DEFAULT_CONFIG,
    locations: parsed.locations,
    ...ctx,
  };
  return [...parsed.diagnostics, ...validateSpec(parsed.spec, context)].map(label);
}

export function label(diagnostic: Diagnostic): string {
  return diagnostic.target === undefined
    ? diagnostic.code
    : `${diagnostic.code}:${diagnostic.target}`;
}

/** Line number (1-based) of the first line that starts with `prefix`. */
export function lineOf(text: string, prefix: string): number {
  return text.split("\n").findIndex((line) => line.startsWith(prefix)) + 1;
}
