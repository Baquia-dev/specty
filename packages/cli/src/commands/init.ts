// SPDX-License-Identifier: Apache-2.0
import { basename } from "node:path";
import {
  backupLine,
  type CardContext,
  DEFAULT_CONFIG,
  dryRunCard,
  GIT_FLOWS,
  type InitRefusal,
  initCard,
  initRefusalCard,
  isAgentTool,
  type Lang,
  languageChoices,
  languageQuestion,
  type Output,
  type ResolvedConfig,
} from "@baquia-dev/specty-core";
import { detectProject, projectFacts } from "../detect/project";
import { commitInstall } from "../install/commit";
import { ensureDevelop } from "../install/git-flow";
import { type InitOptions, type InitSetup, type Installed, install } from "../install/install";
import { type Migration, migrateLegacy } from "../install/legacy";
import { isNewProject } from "../install/product";
import { exists } from "../io/files";
import { createGit, findRoot, type Git, pathsOf } from "../io/git";
import { bareCards, type Environment, systemLanguage } from "../session";
import { loadConfig } from "../store/config";
import { repoPaths, shownPath } from "../store/paths";

/** `specty init` as typed: reads its options, and says which language its output uses. */
export async function initCommand(
  environment: Environment,
  options: {
    readonly language?: string;
    readonly tools?: string;
    readonly gitFlow?: string;
    readonly dryRun?: boolean;
    readonly mcp?: boolean;
  },
): Promise<{ readonly output: Output; readonly lang: Lang }> {
  const language =
    options.language === "es" || options.language === "en" ? options.language : undefined;
  const tools = options.tools
    ?.split(",")
    .map((tool) => tool.trim())
    .filter(isAgentTool);
  const gitFlow = GIT_FLOWS.find((flow) => flow === options.gitFlow);
  if (options.gitFlow !== undefined && gitFlow === undefined) {
    const lang = language ?? systemLanguage(environment.env);
    return {
      output: initRefusalCard({ reason: "unknown-flow", flow: options.gitFlow }, lang),
      lang,
    };
  }
  return init(environment, {
    ...(language !== undefined ? { language } : {}),
    ...(tools !== undefined ? { tools } : {}),
    ...(gitFlow !== undefined ? { gitFlow } : {}),
    ...switches(options),
  });
}

/** The switches of `init` that are on, and only those. */
function switches(options: {
  readonly dryRun?: boolean;
  readonly mcp?: boolean;
}): Pick<InitOptions, "dryRun" | "mcp"> {
  return {
    ...(options.dryRun === true ? { dryRun: true } : {}),
    ...(options.mcp === true ? { mcp: true } : {}),
  };
}

/**
 * `specty init`: detects the project and installs config, AGENTS.md blocks and hooks. Idempotent.
 * Its output goes in the language it worked in.
 */
async function init(
  environment: Environment,
  options: InitOptions,
): Promise<{ readonly output: Output; readonly lang: Lang }> {
  const fallback = options.language ?? systemLanguage(environment.env);
  const refused = (refusal: InitRefusal) => ({
    output: initRefusalCard(refusal, fallback),
    lang: fallback,
  });
  const root = await findRoot(environment.cwd);
  if (root === undefined) return refused({ reason: "no-git" });
  const git = createGit(root, environment.env);
  // What already had changes stays out of init's commit: it is the person's work.
  const before = new Set(pathsOf(await git.changedSince(await git.head())));
  const migration = await migrate(environment, { root, git, options, lang: fallback });
  if (migration.kind === "refused") return { output: migration.output, lang: fallback };
  const existing = await loadConfig(repoPaths(root));
  if (existing.kind === "invalid") {
    const issues = existing.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
    return refused({ reason: "invalid-config", issues });
  }
  const config = existing.kind === "ok" ? existing.config : undefined;
  const lang = await languageOf(environment, options, config);
  const detection = await detectProject(root, basename(root));
  // Read before init writes anything: whether there is a project yet.
  const fresh = isNewProject(detection, await git.files(), config ?? DEFAULT_CONFIG);
  const setup: InitSetup = {
    environment,
    options,
    root,
    git,
    lang,
    detection,
    config,
    created: existing.kind === "missing",
  };
  const installed = withMigration(await install(setup, fresh), migration);
  const cards: CardContext = { ...bareCards(environment.env), lang };
  if (options.dryRun === true) {
    const planned = installed.files.changes.map((change) => ({
      path: shownPath(root, change.path),
      created: change.created,
    }));
    return { output: dryRunCard(planned, installed.warnings, cards), lang };
  }
  return { output: await committed(setup, installed, before, cards), lang };
}

/** The legacy's installation, migrated first, step by step, by the person (ADR 0005). */
function migrate(
  environment: Environment,
  at: {
    readonly root: string;
    readonly git: Git;
    readonly options: InitOptions;
    readonly lang: Lang;
  },
): Promise<Migration> {
  return migrateLegacy({
    environment,
    root: at.root,
    git: at.git,
    cards: { ...bareCards(environment.env), lang: at.lang },
    dryRun: at.options.dryRun === true,
  });
}

/** What init installed, with what the legacy's migration did first and the files it moved. */
function withMigration(installed: Installed, migration: Migration): Installed {
  if (migration.kind !== "done") return installed;
  return {
    ...installed,
    done: [...migration.done, ...installed.done],
    written: [...installed.written, ...migration.written],
  };
}

/** Commits what init wrote, and says what it did, what it detected and what to watch. */
async function committed(
  setup: InitSetup,
  installed: Installed,
  before: ReadonlySet<string>,
  cards: CardContext,
): Promise<Output> {
  const { environment, lang, detection } = setup;
  const result = await commitInstall(environment, installed.written, before, setup.created);
  const backedUp = await exists(installed.backups);
  // Git Flow's target, unless the configuration already sent changes elsewhere.
  const toDevelop =
    installed.flow === "gitflow" && (setup.config?.git.target ?? "develop") === "develop";
  const done = [
    ...installed.done,
    ...result.done,
    ...(toDevelop ? await ensureDevelop(setup.git, lang) : []),
    ...(backedUp ? [backupLine(installed.backups, lang)] : []),
  ];
  const warnings = [...installed.warnings, ...result.warnings];
  const facts = projectFacts(detection);
  const detected = [
    ...facts.stacks,
    ...facts.commands.map((entry) => `${entry.label}: ${entry.command}`),
  ];
  const { product, unfilled } = installed;
  const view = {
    done,
    detected,
    warnings,
    unfilled,
    ...(product === undefined ? {} : { product }),
    ...(installed.chooseFlow ? { chooseFlow: true } : {}),
  };
  return initCard(view, cards);
}

/**
 * The language Specty works in: the one `--language` asks for, the configuration's, or, for a new
 * one, a person's answer to init's first question. An agent cannot be asked: the system's.
 */
async function languageOf(
  environment: Environment,
  options: InitOptions,
  config: ResolvedConfig | undefined,
): Promise<Lang> {
  if (options.language !== undefined) return options.language;
  if (config !== undefined) return config.language;
  const detected = systemLanguage(environment.env);
  if (!environment.terminal.interactive || options.dryRun === true) return detected;
  const chosen = await environment.terminal.choose(languageQuestion(), languageChoices(detected));
  return chosen ?? detected;
}
