// SPDX-License-Identifier: Apache-2.0
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { translator } from "@baquia-dev/specty-core";
import { commitInstall } from "../install/commit";
import { execute, tail } from "../io/exec";
import { pathsOf } from "../io/git";
import { COMMAND, type Session } from "../session";
import type { Edit, InstallPlan } from "./install-plan";
import type { ReportOutput } from "./provider";

/**
 * `specty check --install`: what the checks need in the project, decided by the person file by
 * file. Each edit of the plan (`install-plan.ts`) shows its diff and waits for a yes; with
 * `--dry-run`, the plan is only shown. What is applied goes into one commit with a receipt.
 */

type Translate = ReturnType<typeof translator>;

/** The lockfiles a devDependency may change, committed with `package.json` if they had nothing of the person's. */
const LOCKFILES = ["package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lock", "bun.lockb"];

/** Shows the plan with `dryRun`; otherwise asks for each step and applies what the person confirms. */
export async function install(
  session: Session,
  plan: InstallPlan,
  dryRun: boolean,
): Promise<ReportOutput> {
  const t = translator(session.lang);
  const { terminal } = session.environment;
  if (!dryRun && !terminal.interactive) {
    const error = t(
      `Instalar las verificaciones lo decide la persona en su terminal: \`${COMMAND} check --install\`. Para ver qué cambiaría, añade \`--dry-run\`.`,
      `Installing the checks is the person's decision, in their terminal: \`${COMMAND} check --install\`. To see what it would change, add \`--dry-run\`.`,
    );
    return { report: error, json: { error }, code: 1 };
  }
  const empty = plan.edits.length === 0 && plan.devDependencies.length === 0;
  if (dryRun || empty) return planned(plan, t);
  const before = new Set(pathsOf(await session.git.changedSince(await session.git.head())));
  const edits = await applyEdits(session, plan.edits, t);
  const dependencies = await installDependencies(session, plan.devDependencies, t);
  const outcome: Outcome = {
    applied: [...edits.applied, ...dependencies.applied],
    declined: [...edits.declined, ...dependencies.declined],
    failed: dependencies.failed,
    written: [...edits.written, ...dependencies.written],
  };
  return installed(session, plan, outcome, before, t);
}

/** What the person's answers did, and the files to commit. */
interface Outcome {
  readonly applied: readonly string[];
  readonly declined: readonly string[];
  readonly failed: readonly string[];
  readonly written: readonly string[];
}

/** Each edit with its diff, written when the person says yes. */
async function applyEdits(
  session: Session,
  edits: readonly Edit[],
  t: Translate,
): Promise<Outcome> {
  const { terminal } = session.environment;
  const applied: string[] = [];
  const declined: string[] = [];
  for (const edit of edits) {
    terminal.note(titleOf(edit, t), await diffOf(edit));
    if (
      await terminal.confirm(
        t(`¿Aplicar este cambio en ${edit.path}?`, `Apply this change to ${edit.path}?`),
      )
    ) {
      await mkdir(dirname(edit.file), { recursive: true });
      await writeFile(edit.file, edit.after);
      applied.push(edit.path);
    } else {
      declined.push(edit.path);
    }
  }
  return { applied, declined, failed: [], written: applied };
}

/** Each devDependency with its command, installed when the person says yes. */
async function installDependencies(
  session: Session,
  dependencies: InstallPlan["devDependencies"],
  t: Translate,
): Promise<Outcome> {
  const { terminal } = session.environment;
  const applied: string[] = [];
  const declined: string[] = [];
  const failed: string[] = [];
  const written: string[] = [];
  for (const dependency of dependencies) {
    const label = `${dependency.name}@${dependency.version}`;
    terminal.note(
      t(`${label} como devDependency`, `${label} as a devDependency`),
      dependency.command,
    );
    if (!(await terminal.confirm(t(`¿Instalar ${label}?`, `Install ${label}?`)))) {
      declined.push(label);
      continue;
    }
    const result = await execute(dependency.command, [], {
      cwd: session.root,
      env: session.environment.env,
      shell: true,
      timeoutMs: session.config.verify.timeoutSec * 1000,
    });
    if (result.code === 0) {
      applied.push(label);
      written.push("package.json", ...LOCKFILES);
    } else {
      failed.push(`${label}: ${tail(result, 1)[0] ?? `exit ${result.code ?? "?"}`}`);
    }
  }
  return { applied, declined, failed, written };
}

/** Commits what was written, and reports what was applied, declined, failed or left to the person. */
async function installed(
  session: Session,
  plan: InstallPlan,
  outcome: Outcome,
  before: ReadonlySet<string>,
  t: Translate,
): Promise<ReportOutput> {
  const { applied, declined, failed, written } = outcome;
  const commit =
    written.length === 0
      ? { done: [], warnings: [] }
      : await commitInstall(session.environment, written, before, false);
  const report = [
    ...section(t("Aplicado:", "Applied:"), applied),
    ...section(t("Sin aplicar:", "Not applied:"), declined),
    ...section(t("Falló:", "Failed:"), failed),
    ...section(t("Conflictos (no se tocan):", "Conflicts (left untouched):"), plan.conflicts),
    ...section(t("Hazlo tú:", "Do it yourself:"), plan.hints),
    ...commit.done,
    ...commit.warnings,
  ].join("\n");
  const json = { applied, declined, failed, conflicts: plan.conflicts, hints: plan.hints };
  return { report, json, code: failed.length > 0 ? 1 : 0 };
}

/** The plan as text: each edit with its diff, each command, the conflicts and what is left. */
async function planned(plan: InstallPlan, t: Translate): Promise<ReportOutput> {
  const edits = await Promise.all(
    plan.edits.map(async (edit) => `${titleOf(edit, t)}\n${await diffOf(edit)}\n`),
  );
  const dependencies = plan.devDependencies.map(
    (dependency) =>
      `${t(`${dependency.name}@${dependency.version} como devDependency`, `${dependency.name}@${dependency.version} as a devDependency`)}: \`${dependency.command}\`\n`,
  );
  const empty = edits.length === 0 && dependencies.length === 0;
  const report = [
    ...edits,
    ...dependencies,
    ...(empty ? [t("No hay nada que instalar.", "Nothing to install.")] : []),
    ...section(t("Conflictos (no se tocan):", "Conflicts (left untouched):"), plan.conflicts),
    ...section(t("Hazlo tú:", "Do it yourself:"), plan.hints),
    ...(empty
      ? []
      : [
          t(
            `Para aplicarlo, ejecuta \`${COMMAND} check --install\` en tu terminal.`,
            `To apply it, run \`${COMMAND} check --install\` in your terminal.`,
          ),
        ]),
  ].join("\n");
  const json = {
    edits: plan.edits.map((edit) => ({ path: edit.path, created: edit.before === undefined })),
    devDependencies: plan.devDependencies,
    conflicts: plan.conflicts,
    hints: plan.hints,
  };
  return { report, json, code: 0 };
}

function section(title: string, lines: readonly string[]): string[] {
  return lines.length === 0 ? [] : [title, ...lines.map((line) => `  ${line}`)];
}

function titleOf(edit: Edit, t: Translate): string {
  return `${edit.path} (${edit.before === undefined ? t("crear", "create") : t("modificar", "change")})`;
}

/** The unified diff from `before` to `after`, by `git diff --no-index`, under the edit's path. */
async function diffOf(edit: Edit): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), "specty-diff-"));
  try {
    await writeFile(join(folder, "before"), edit.before ?? "");
    await writeFile(join(folder, "after"), edit.after);
    const result = await execute(
      "git",
      ["diff", "--no-index", "--no-color", "-U3", "--", "before", "after"],
      { cwd: folder },
    );
    const lines = result.stdout.split("\n");
    const hunks = lines.slice(
      Math.max(
        0,
        lines.findIndex((line) => line.startsWith("@@")),
      ),
    );
    const from = edit.before === undefined ? "/dev/null" : `a/${edit.path}`;
    return [`--- ${from}`, `+++ b/${edit.path}`, ...hunks].join("\n").trimEnd();
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}
