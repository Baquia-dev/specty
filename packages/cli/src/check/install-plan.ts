// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import { checkLevel, translator } from "@baquia-dev/specty-core";
import { Document, parseDocument } from "yaml";
import type { Stack } from "../detect/stack";
import { targetBranch } from "../flow/worktree";
import { type InstallFiles, installFiles } from "../install/files";
import { execute } from "../io/exec";
import { exists, readText } from "../io/files";
import type { Session } from "../session";
import { shownPath } from "../store/paths";
import { ciTemplates, spectyVersion } from "./ci";
import { analyzerOptions, STRICT_MODES } from "./dart";
import { agentStopHooks } from "./install-agents";
import { agentIgnores } from "./install-ignores";

/**
 * The plan of `specty check --install`: each step writes what it would change into one set of
 * files planned in a dry run, after the steps before it, so two steps on the same file give one
 * edit with both changes. What the person already set differently is a conflict, and a step
 * that finds everything in place writes nothing.
 */

/** A file the install would write: where it is, how to show it, and its text before and after. */
export interface Edit {
  /** Absolute. */
  readonly file: string;
  /** Repository-relative, or absolute outside the repository (Codex's hooks). */
  readonly path: string;
  /** None for a file it creates. */
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

/** A step of the plan: it writes into `files` and gives its conflicts. */
type Step = (files: InstallFiles) => Promise<readonly string[]>;

/** The version Specty was checked with; installed exactly, never a range. */
const DEPENDENCY_CRUISER = { name: "dependency-cruiser", version: "18.7.0" } as const;
const ADD_DEV: Readonly<Record<string, (spec: string) => string>> = {
  pnpm: (spec) => `pnpm add --save-dev --save-exact ${spec}`,
  yarn: (spec) => `yarn add --dev --exact ${spec}`,
  bun: (spec) => `bun add --dev --exact ${spec}`,
};
const npmAdd = (spec: string) => `npm install --save-dev --save-exact ${spec}`;

export async function planInstall(
  session: Session,
  stacks: readonly Stack[],
): Promise<InstallPlan> {
  const t = translator(session.lang);
  const files = installFiles({ dryRun: true });
  const steps: readonly Step[] = [
    (planned) => preCommit(session, planned, t),
    (planned) => ci(session, stacks, planned, t),
    (planned) => dartStrict(session, stacks, planned, t),
    async (planned) => {
      await agentStopHooks(session, planned);
      return [];
    },
    async (planned) => {
      await agentIgnores(session, planned);
      return [];
    },
  ];
  const conflicts: string[] = [];
  // One after another: each step reads what the ones before it planned.
  for (const step of steps) conflicts.push(...(await step(files)));
  return {
    edits: await editsOf(session, files),
    conflicts,
    devDependencies: await devDependencies(session, stacks),
    hints: await hints(session, t),
  };
}

/** One edit per file the steps changed: its text on disk before, and the planned one after. */
async function editsOf(session: Session, files: InstallFiles): Promise<Edit[]> {
  const found = await Promise.all(
    files.changes.map(async ({ path: file }): Promise<Edit[]> => {
      const before = await readText(file);
      const after = await files.read(file);
      if (after === undefined || after === before) return [];
      const path = shownPath(session.root, file);
      return [{ file, path, after, ...(before !== undefined ? { before } : {}) }];
    }),
  );
  return found.flat();
}

async function preCommit(
  session: Session,
  files: InstallFiles,
  t: Translate,
): Promise<readonly string[]> {
  const path = ".specty/config.yaml";
  const file = join(session.root, path);
  const document = parseDocument((await files.read(file)) ?? "");
  const current = document.getIn(["checks", "preCommit"]);
  if (current === true) return [];
  if (current === false) {
    return [
      `${path}: ${t(
        "`checks.preCommit` está en false; cámbialo tú si quieres las verificaciones en el pre-commit",
        "`checks.preCommit` is false; change it yourself if you want the checks in the pre-commit",
      )}`,
    ];
  }
  document.setIn(["checks", "preCommit"], true);
  await files.write(file, document.toString());
  return [];
}

async function ci(
  session: Session,
  stacks: readonly Stack[],
  files: InstallFiles,
  t: Translate,
): Promise<readonly string[]> {
  const branch = (await targetBranch(session.git, session.config.git.target)) ?? "main";
  const templates = ciTemplates({
    stack: stacks[0],
    version: await spectyVersion(),
    branch,
    lang: session.lang,
  });
  const conflicts: string[] = [];
  for (const template of templates) {
    const file = join(session.root, template.path);
    const current = await files.read(file);
    if (current === undefined) {
      await files.write(file, template.text);
    } else if (current !== template.text) {
      const conflict = t(
        "ya existe con otro contenido; no se pisa",
        "already exists with other content; it is not overwritten",
      );
      conflicts.push(`${template.path}: ${conflict}`);
    }
  }
  return conflicts;
}

/** The strict modes Dart's analyzer still lacks, set in `analysis_options.yaml`. */
async function dartStrict(
  session: Session,
  stacks: readonly Stack[],
  files: InstallFiles,
  t: Translate,
): Promise<readonly string[]> {
  if (!stacks.some((stack) => stack.language === "dart")) return [];
  const path = "analysis_options.yaml";
  const file = join(session.root, path);
  const document = documentOf((await files.read(file)) ?? "");
  const resolved = await analyzerOptions(session.root);
  const conflicts: string[] = [];
  const missing = STRICT_MODES.filter((mode) => {
    if (document.getIn(["analyzer", "language", mode]) !== false) {
      return resolved.modes[mode] !== true;
    }
    conflicts.push(
      `${path}: ${t(
        `${mode} está en false en \`analyzer.language\`; cámbialo tú si quieres el modo estricto`,
        `${mode} is false in \`analyzer.language\`; change it yourself if you want the strict mode`,
      )}`,
    );
    return false;
  });
  if (missing.length === 0) return conflicts;
  for (const mode of missing) document.setIn(["analyzer", "language", mode], true);
  await files.write(file, document.toString());
  return conflicts;
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
