// SPDX-License-Identifier: Apache-2.0
import {
  type CheckMode,
  type Output,
  renderReport,
  reportExitCode,
  reportJson,
} from "@baquia-dev/specty-core";
import type { Command } from "commander";
import { commonProvider } from "../check/common";
import { checkContext } from "../check/files";
import { type Provider, type ReportOutput, runChecks } from "../check/provider";
import { detectStacks } from "../detect/stack";
import type { Session } from "../session";

/** Every provider `specty check` knows; each says whether it applies to the repository. */
const PROVIDERS: readonly Provider[] = [commonProvider];

interface CheckOptions {
  readonly changed?: boolean;
  readonly staged?: boolean;
  readonly all?: boolean;
  readonly verbose?: boolean;
}

/** Registers `specty check`; `run` opens the session as for every command. */
export function checkCommand(
  program: Command,
  run: (handler: (session: Session) => Promise<Output | ReportOutput>) => () => Promise<void>,
): void {
  program
    .command("check")
    .description("run the quality checks on what changed (default), what is staged or everything")
    .option("--changed", "what changed against the target branch, plus new files (default)")
    .option("--staged", "what is staged, for a pre-commit hook")
    .option("--all", "everything git tracks, for CI")
    .option("--verbose", "every finding, what passed and why a check did not run")
    .action((options: CheckOptions) =>
      run((session) => check(session, modeOf(options), options.verbose === true))(),
    );
}

/** `specty check`: deterministic, with no model and no agent (ADR 0012). */
export async function check(session: Session, mode: CheckMode, verbose: boolean) {
  const [context, stacks] = await Promise.all([
    checkContext(session, mode),
    detectStacks(session.root),
  ]);
  const report = await runChecks(context, PROVIDERS, stacks);
  return {
    report: renderReport(report, {
      lang: session.lang,
      verbose,
      maxFindings: session.config.checks.maxFindings,
    }),
    json: reportJson(report),
    code: reportExitCode(report),
  } satisfies ReportOutput;
}

/** The widest mode asked for wins: `--all`, then `--staged`, then `--changed`. */
function modeOf(options: CheckOptions): CheckMode {
  if (options.all === true) return "all";
  return options.staged === true ? "staged" : "changed";
}
