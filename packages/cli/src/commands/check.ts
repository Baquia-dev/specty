// SPDX-License-Identifier: Apache-2.0
import {
  type CheckMode,
  COMMAND_CHECKS,
  type Output,
  renderReport,
  reportExitCode,
  reportJson,
  translator,
} from "@baquia-dev/specty-core";
import type { Command } from "commander";
import { projectProvider } from "../check/commands";
import { commonProvider } from "../check/common";
import { dartProvider } from "../check/dart";
import { checkContext } from "../check/files";
import { functionsProvider } from "../check/functions";
import { detectGenerators, type Generator, generatedProvider } from "../check/generated";
import { install } from "../check/install";
import { planInstall } from "../check/install-plan";
import { layersProvider } from "../check/layers";
import { loadPlan, type Plan, planProvider } from "../check/plan";
import { type Provider, type ReportOutput, runChecks } from "../check/provider";
import { suppressionsProvider } from "../check/suppressions";
import { typescriptProvider } from "../check/typescript";
import { detectStacks, type Stack } from "../detect/stack";
import type { Session } from "../session";

/**
 * The providers of a run, in the order of its report: the project's own commands, each stack's,
 * the suppressions of each language, those of every language with braces, the common ones and,
 * with `--spec`, the plan's. Each one says whether it applies to the repository's stacks.
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
    dartProvider,
    suppressionsProvider,
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
  readonly install?: boolean;
  readonly dryRun?: boolean;
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
    .option("--install", "prepare the project for its checks, showing each diff and asking first")
    .option("--dry-run", "with --install: only show what it would change")
    .action((options: CheckOptions) =>
      run((session) =>
        options.install === true
          ? installChecks(session, options.dryRun === true)
          : check(session, modeOf(options), options.verbose === true, specOf(options)),
      )(),
    );
}

/** `specty check --install`: the person decides each file; `--dry-run` only shows the plan. */
async function installChecks(session: Session, dryRun: boolean): Promise<ReportOutput> {
  const stacks = await detectStacks(session.root);
  return install(session, await planInstall(session, stacks), dryRun);
}

/** What `task done` checks on its own, per task: its scope and the length of its files. */
const TASK_DONE_CHECKS = ["scope", "max-lines"];

/**
 * The run of `task done` (ADR 0012): what changed, with the plan of `change`. It leaves out what
 * `task done` checks itself and, when the task has a verification, the project's own commands:
 * that verification is how the person runs them at each task, so the tests never run twice.
 */
export function taskChecks(
  session: Session,
  change: string,
  verified: boolean,
): Promise<ReportOutput> {
  const skip = new Set([...TASK_DONE_CHECKS, ...(verified ? COMMAND_CHECKS : [])]);
  return check(session, "changed", false, { id: change }, skip);
}

/** `specty check`: deterministic, with no model and no agent (ADR 0012). */
export async function check(
  session: Session,
  mode: CheckMode,
  verbose: boolean,
  spec?: SpecOption,
  skip: ReadonlySet<string> = new Set(),
): Promise<ReportOutput> {
  if (spec !== undefined && mode === "all") return withoutDiff(session);
  const [context, stacks, plan] = await Promise.all([
    checkContext(session, mode),
    detectStacks(session.root),
    spec === undefined ? undefined : loadPlan(session, spec.id),
  ]);
  const generators = await detectGenerators(session, stacks);
  const providers = providersOf(session, stacks, generators, plan).map((provider) => ({
    ...provider,
    checks: provider.checks.filter((definition) => !skip.has(definition.id)),
  }));
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
