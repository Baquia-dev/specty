// SPDX-License-Identifier: Apache-2.0
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { checkLevel, translator } from "@baquia-dev/specty-core";
import { Document, parseDocument } from "yaml";
import type { Stack } from "../detect/stack";
import { targetBranch } from "../flow/worktree";
import { commitInstall } from "../install/commit";
import { execute, tail } from "../io/exec";
import { exists, readText } from "../io/files";
import { pathsOf } from "../io/git";
import { COMMAND, type Session } from "../session";
import { ciTemplates, spectyVersion } from "./ci";
import { analyzerOptions, STRICT_MODES } from "./dart";
import type { ReportOutput } from "./provider";

/**
 * `specty check --install`: what the checks need in the project, decided by the person file by
 * file. Each edit shows its diff and waits for a yes; what the person already set differently is
 * a conflict, reported and never overwritten; and a second run finds nothing left to do.
 */

/** A file the install would write, repository-relative: its text before (none if new) and after. */
interface Edit {
  readonly path: string;
  readonly before?: string;
  readonly after: string;
}

interface DevDependency {
  readonly name: string;
  readonly version: string;
  readonly command: string;
}

export interface InstallPlan {
  readonly edits: readonly Edit[];
  readonly conflicts: readonly string[];
  readonly devDependencies: readonly DevDependency[];
  /** What Specty cannot install, for the person to do. */
  readonly hints: readonly string[];
}

type Translate = ReturnType<typeof translator>;

/** The version Specty was checked with; installed exactly, never a range. */
const DEPENDENCY_CRUISER = { name: "dependency-cruiser", version: "18.7.0" } as const;
const ADD_DEV: Readonly<Record<string, (spec: string) => string>> = {
  pnpm: (spec) => `pnpm add --save-dev --save-exact ${spec}`,
  yarn: (spec) => `yarn add --dev --exact ${spec}`,
  bun: (spec) => `bun add --dev --exact ${spec}`,
};
const npmAdd = (spec: string) => `npm install --save-dev --save-exact ${spec}`;
const LOCKFILES = ["package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lock", "bun.lockb"];

export async function planInstall(
  session: Session,
  stacks: readonly Stack[],
): Promise<InstallPlan> {
  const t = translator(session.lang);
  const steps = await Promise.all([
    preCommit(session, t),
    ci(session, stacks, t),
    dartStrict(session, stacks, t),
  ]);
  return {
    edits: steps.flatMap((step) => step.edits),
    conflicts: steps.flatMap((step) => step.conflicts),
    devDependencies: await devDependencies(session, stacks),
    hints: await hints(session, t),
  };
}

interface Step {
  readonly edits: readonly Edit[];
  readonly conflicts: readonly string[];
}

async function preCommit(session: Session, t: Translate): Promise<Step> {
  const path = ".specty/config.yaml";
  const before = (await readText(join(session.root, path))) ?? "";
  const document = parseDocument(before);
  const current = document.getIn(["checks", "preCommit"]);
  if (current === true) return { edits: [], conflicts: [] };
  if (current === false) {
    return {
      edits: [],
      conflicts: [
        `${path}: ${t(
          "`checks.preCommit` está en false; cámbialo tú si quieres las verificaciones en el pre-commit",
          "`checks.preCommit` is false; change it yourself if you want the checks in the pre-commit",
        )}`,
      ],
    };
  }
  document.setIn(["checks", "preCommit"], true);
  return { edits: [{ path, before, after: document.toString() }], conflicts: [] };
}

async function ci(session: Session, stacks: readonly Stack[], t: Translate): Promise<Step> {
  const branch = (await targetBranch(session.git, session.config.git.target)) ?? "main";
  const templates = ciTemplates({
    stack: stacks[0],
    version: await spectyVersion(),
    branch,
    lang: session.lang,
  });
  const found = await Promise.all(
    templates.map(async (template): Promise<Step> => {
      const current = await readText(join(session.root, template.path));
      if (current === undefined) {
        return { edits: [{ path: template.path, after: template.text }], conflicts: [] };
      }
      if (current === template.text) return { edits: [], conflicts: [] };
      const conflict = t(
        "ya existe con otro contenido; no se pisa",
        "already exists with other content; it is not overwritten",
      );
      return { edits: [], conflicts: [`${template.path}: ${conflict}`] };
    }),
  );
  return {
    edits: found.flatMap((step) => step.edits),
    conflicts: found.flatMap((step) => step.conflicts),
  };
}

/** The strict modes Dart's analyzer still lacks, set in `analysis_options.yaml`. */
async function dartStrict(session: Session, stacks: readonly Stack[], t: Translate): Promise<Step> {
  if (!stacks.some((stack) => stack.language === "dart")) return { edits: [], conflicts: [] };
  const path = "analysis_options.yaml";
  const before = await readText(join(session.root, path));
  const document = documentOf(before ?? "");
  const resolved = await analyzerOptions(session.root);
  const conflicts: string[] = [];
  const missing = STRICT_MODES.filter((mode) => {
    if (document.getIn(["analyzer", "language", mode]) !== false)
      return resolved.modes[mode] !== true;
    conflicts.push(
      `${path}: ${t(
        `${mode} está en false en \`analyzer.language\`; cámbialo tú si quieres el modo estricto`,
        `${mode} is false in \`analyzer.language\`; change it yourself if you want the strict mode`,
      )}`,
    );
    return false;
  });
  if (missing.length === 0) return { edits: [], conflicts };
  for (const mode of missing) document.setIn(["analyzer", "language", mode], true);
  const edit = { path, after: document.toString(), ...(before !== undefined ? { before } : {}) };
  return { edits: [edit], conflicts };
}

/** A YAML document to edit; an empty or missing file starts as an empty map. */
function documentOf(text: string): Document {
  return text.trim() === "" ? new Document({}) : parseDocument(text);
}

async function devDependencies(
  session: Session,
  stacks: readonly Stack[],
): Promise<DevDependency[]> {
  const scripts = stacks.find(
    (stack) => stack.language === "typescript" || stack.language === "javascript",
  );
  const layered = Object.keys(session.config.checks.layers).length > 0;
  const bin = join(session.root, "node_modules", ".bin", "depcruise");
  if (scripts === undefined || !layered || (await exists(bin))) return [];
  const tool = scripts.tool ?? "npm";
  const add = Object.hasOwn(ADD_DEV, tool) ? (ADD_DEV[tool] ?? npmAdd) : npmAdd;
  const { name, version } = DEPENDENCY_CRUISER;
  return [{ name, version, command: add(`${name}@${version}`) }];
}

async function hints(session: Session, t: Translate): Promise<string[]> {
  if (checkLevel(session.config, "secrets") === "off") return [];
  const found = await Promise.all(
    ["betterleaks", "gitleaks"].map(
      async (program) => (await execute(program, ["version"], { cwd: session.root })).code !== 127,
    ),
  );
  if (found.some(Boolean)) return [];
  return [
    t(
      "Para `secrets`, instala Betterleaks (o gitleaks) en tu máquina y en la CI.",
      "For `secrets`, install Betterleaks (or gitleaks) on your machine and in CI.",
    ),
  ];
}

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
  const applied: string[] = [];
  const declined: string[] = [];
  const failed: string[] = [];
  const written: string[] = [];
  for (const edit of plan.edits) {
    terminal.note(titleOf(edit, t), await diffOf(edit));
    if (
      await terminal.confirm(
        t(`¿Aplicar este cambio en ${edit.path}?`, `Apply this change to ${edit.path}?`),
      )
    ) {
      await mkdir(dirname(join(session.root, edit.path)), { recursive: true });
      await writeFile(join(session.root, edit.path), edit.after);
      applied.push(edit.path);
      written.push(edit.path);
    } else {
      declined.push(edit.path);
    }
  }
  for (const dependency of plan.devDependencies) {
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
