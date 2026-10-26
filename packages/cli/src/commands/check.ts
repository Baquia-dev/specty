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
import { functionsProvider } from "../check/functions";
import { detectGenerators, type Generator, generatedProvider } from "../check/generated";
import { layersProvider } from "../check/layers";
import { loadPlan, type Plan, planProvider } from "../check/plan";
import { type Provider, type ReportOutput, runChecks } from "../check/provider";
import { typescriptProvider } from "../check/typescript";
import { detectStacks, type Stack } from "../detect/stack";
import type { Session } from "../session";

/**
 * The providers of a run, in the order of its report: the project's own commands, each stack's,
 * those of every language with braces, the common ones and, with `--spec`, the plan's. Each one
 * says whether it applies to the repository's stacks.
 */
function providersOf(
  session: Session,
  stacks: readonly Stack[],
  generators: readonly Generator[],
  plan: Plan | undefined,
): Provider[] {
  return [
    projectProvider(stacks, session.config),
    typescriptProvider,
    layersProvider(session.config),
    functionsProvider,
    generatedProvider(generators),
    commonProvider,
    ...(plan === undefined ? [] : [planProvider(plan)]),
  ];
}

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
  const generators = await detectGenerators(session, stacks);
  const report = await runChecks(context, providersOf(session, stacks, generators, plan), stacks);
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
