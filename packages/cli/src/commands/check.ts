// SPDX-License-Identifier: Apache-2.0
import {
  type CheckMode,
  type Output,
  renderReport,
  reportExitCode,
  reportJson,
  translator,
} from "@baquia-dev/specty-core";
import type { Command } from "commander";
import { projectProvider } from "../check/commands";
import { commonProvider } from "../check/common";
import { checkContext } from "../check/files";
import { loadPlan, planProvider } from "../check/plan";
import { type Provider, type ReportOutput, runChecks } from "../check/provider";
import { detectStacks } from "../detect/stack";
import type { Session } from "../session";

/** Every provider `specty check` knows; each says whether it applies to the repository. */
const PROVIDERS: readonly Provider[] = [commonProvider];
// The project's own commands come first, from the stacks of each run.

interface CheckOptions {
  readonly changed?: boolean;
  readonly staged?: boolean;
  readonly all?: boolean;
  readonly verbose?: boolean;
  /** `true` for `--spec` alone: the active change. */
  readonly spec?: string | boolean;
}

/** The change whose plan `--spec` checks: the one named, or the active one with no id. */
interface SpecOption {
  readonly id: string | undefined;
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
    .option("--spec [id]", "also what the approved plan of a change allows (the active one)")
    .option("--verbose", "every finding, what passed and why a check did not run")
    .action((options: CheckOptions) =>
      run((session) =>
        check(session, modeOf(options), options.verbose === true, specOf(options)),
      )(),
    );
}

/** `specty check`: deterministic, with no model and no agent (ADR 0012). */
export async function check(
  session: Session,
  mode: CheckMode,
  verbose: boolean,
  spec?: SpecOption,
): Promise<ReportOutput> {
  if (spec !== undefined && mode === "all") return withoutDiff(session);
  const [context, stacks, plan] = await Promise.all([
    checkContext(session, mode),
    detectStacks(session.root),
    spec === undefined ? undefined : loadPlan(session, spec.id),
  ]);
  const providers = [
    projectProvider(stacks, session.config),
    ...PROVIDERS,
    ...(plan === undefined ? [] : [planProvider(plan)]),
  ];
  const report = await runChecks(context, providers, stacks);
  return {
    report: renderReport(report, {
      lang: session.lang,
      verbose,
      maxFindings: session.config.checks.maxFindings,
    }),
    json: reportJson(report),
    code: reportExitCode(report),
  };
}

/** `--spec` compares the change's diff with its plan, and `--all` has no diff. */
function withoutDiff(session: Session): ReportOutput {
  const error = translator(session.lang)(
    "--spec mira el diff del cambio: úsalo con --changed (por defecto) o con --staged, no con --all.",
    "--spec looks at the change's diff: use it with --changed (the default) or --staged, not --all.",
  );
  return { report: error, json: { error }, code: 1 };
}

/** The widest mode asked for wins: `--all`, then `--staged`, then `--changed`. */
function modeOf(options: CheckOptions): CheckMode {
  if (options.all === true) return "all";
  return options.staged === true ? "staged" : "changed";
}

function specOf(options: CheckOptions): SpecOption | undefined {
  if (options.spec === undefined || options.spec === false) return undefined;
  return { id: options.spec === true ? undefined : options.spec };
}
