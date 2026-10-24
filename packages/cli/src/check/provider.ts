// SPDX-License-Identifier: Apache-2.0
import {
  type CheckMode,
  type CheckReport,
  type CheckResult,
  checkLevel,
  type Finding,
} from "@baquia-dev/specty-core";
import type { Stack } from "../detect/stack";
import type { Session } from "../session";

/**
 * The common interface of `specty check` (ADR 0012): a provider says whether it applies to the
 * repository's stacks and brings its checks; a check looks at the run's files and gives its
 * findings, or why it could not run. Adding a stack means adding a provider, not changing this.
 */

export interface CheckContext {
  readonly session: Session;
  readonly mode: CheckMode;
  /** Repository-relative files of the run, the excluded ones already left out. */
  readonly files: readonly string[];
  /** The text of `path` as the mode sees it: staged with `--staged`, on disk otherwise. */
  read(path: string): Promise<string | undefined>;
  /** Lines `path` adds, from 1; undefined when every line of it counts (`--all`, a new file). */
  added(path: string): ReadonlySet<number> | undefined;
}

/** What one check gives: its findings, or why it could not run (a missing tool, say). */
export type CheckOutcome = { readonly findings: readonly Finding[] } | { readonly skipped: string };

export interface CheckDefinition {
  /** Stable id: the key of its level in `checks.levels` and its name in the output. */
  readonly id: string;
  run(context: CheckContext): Promise<CheckOutcome>;
}

export interface Provider {
  readonly id: string;
  /** True when the provider applies to a repository with these stacks. */
  applies(stacks: readonly Stack[]): boolean;
  readonly checks: readonly CheckDefinition[];
}

/** What `specty check` prints: its own report, not a card, and the exit code it ends with. */
export interface ReportOutput {
  readonly report: string;
  readonly json: unknown;
  readonly code: 0 | 1;
}

/**
 * Runs the checks of the providers that apply, each at its configured level: one set to `off`
 * does not run, and one that throws counts as not run, with the error as its reason.
 */
export async function runChecks(
  context: CheckContext,
  providers: readonly Provider[],
  stacks: readonly Stack[],
): Promise<CheckReport> {
  // A check two providers bring runs once, from the first.
  const checks = providers
    .filter((provider) => provider.applies(stacks))
    .flatMap((provider) => provider.checks)
    .filter((check, index, all) => all.findIndex((other) => other.id === check.id) === index);
  const results = await Promise.all(
    checks.map(async (check): Promise<CheckResult[]> => {
      const level = checkLevel(context.session.config, check.id);
      if (level === "off") return [];
      const outcome = await check.run(context).catch(
        (error: unknown): CheckOutcome => ({
          skipped: error instanceof Error ? error.message : String(error),
        }),
      );
      return [
        "skipped" in outcome
          ? { id: check.id, level, findings: [], skipped: outcome.skipped }
          : { id: check.id, level, findings: outcome.findings },
      ];
    }),
  );
  return { mode: context.mode, results: results.flat() };
}
