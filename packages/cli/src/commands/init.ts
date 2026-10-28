// SPDX-License-Identifier: Apache-2.0
import { basename, join } from "node:path";
import {
  type AgentTool,
  agentsMdLine,
  backupLine,
  type CardContext,
  DEFAULT_CONFIG,
  defaultGlossary,
  dryRunCard,
  GIT_FLOWS,
  type GitFlow,
  glossaryLine,
  type InitRefusal,
  initCard,
  initRefusalCard,
  isAgentTool,
  type Lang,
  languageChoices,
  languageQuestion,
  noTestCommandWarning,
  type Output,
  productLine,
  type ResolvedConfig,
  unfilledSections,
} from "@baquia-dev/specty-core";
import { type Detection, detectProject, projectFacts, verifyCommands } from "../detect/project";
import { commitInstall } from "../install/commit";
import { type InstallFiles, installFiles } from "../install/files";
import { ensureDevelop, flowToWrite, noFlowWarnings } from "../install/git-flow";
import { agentsToInstall, installHooks } from "../install/hooks";
import { type Migration, migrateLegacy } from "../install/legacy";
import { installMcp } from "../install/mcp";
import { isNewProject, writeProduct } from "../install/product";
import { writeAgentsMd, writeConfig, writeGlossary } from "../install/project-files";
import { exists } from "../io/files";
import { createGit, findRoot, type Git, pathsOf } from "../io/git";
import { bareCards, type Environment, systemLanguage } from "../session";
import { loadConfig } from "../store/config";
import { repoPaths, shownPath } from "../store/paths";

interface InitOptions {
  readonly language?: Lang;
  /** Agent tools to configure; by default, the ones detected in the repository. */
  readonly tools?: readonly AgentTool[];
  /** How the changes' branches are named (`git.flow`); by default, left as it is. */
  readonly gitFlow?: GitFlow;
  /** Only say what it would create or change: nothing is written or committed. */
  readonly dryRun?: boolean;
  /** Also register Specty's MCP server in each agent's project configuration. */
  readonly mcp?: boolean;
}

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

/** What init works with once it knows the repository, its language and its project. */
interface InitSetup {
  readonly environment: Environment;
  readonly options: InitOptions;
  readonly root: string;
  readonly git: Git;
  readonly lang: Lang;
  readonly detection: Detection;
  /** The configuration there was, when it was valid. */
  readonly config: ResolvedConfig | undefined;
  /** Whether init creates `.specty/config.yaml`. */
  readonly created: boolean;
}

/** What init installed, or only planned in a dry run, and what it has to say about it. */
interface Installed {
  readonly files: InstallFiles;
  readonly backups: string;
  readonly product: Awaited<ReturnType<typeof writeProduct>> | undefined;
  readonly done: readonly string[];
  /** Repository-relative files init writes that git tracks: they go into its commit. */
  readonly written: readonly string[];
  readonly warnings: readonly string[];
  /** The sections of AGENTS.md people complete by hand that are still empty. */
  readonly unfilled: readonly string[];
  /** The git flow init wrote, if any. */
  readonly flow: GitFlow | undefined;
  /** A new project ended without a flow: its next step chooses one. */
  readonly chooseFlow: boolean;
}

/** The configuration, AGENTS.md, PRODUCT.md for a new project, and each agent's hooks. */
async function install(setup: InitSetup, fresh: boolean): Promise<Installed> {
  const { environment, options, root, git, lang, detection } = setup;
  const { files, backups } = await installTarget(setup);
  const dryRun = options.dryRun === true;
  // Asked right after the language, before a new project's interview.
  const agents = await agentsToInstall({
    environment,
    given: options.tools,
    detected: detection.tools,
    lang,
    dryRun,
  });
  // Then the flow, which goes in config.yaml before PRODUCT.md is written.
  const flow = await flowToWrite({
    environment,
    git,
    given: options.gitFlow,
    configured: setup.config?.git.flow,
    created: setup.created,
    dryRun,
    lang,
  });
  const project = await writeProjectFiles(setup, fresh, files, flow.flow);
  const noFlow = noFlowWarnings(flow, project.product !== undefined, lang);
  const { tools } = agents;
  const hooks = await installHooks({ environment, root, git, tools, lang, files });
  const { invocation } = environment;
  const mcp =
    options.mcp === true
      ? await installMcp({ root, tools, invocation, files, lang })
      : { done: [], warnings: [], written: [] };
  const noTests =
    setup.config?.verify.default === undefined &&
    verifyCommands(detection.commands).default === undefined;
  return {
    files,
    backups,
    product: project.product,
    done: [...project.done, ...hooks.done, ...mcp.done],
    written: [...project.written, ...hooks.written, ...mcp.written],
    unfilled: project.unfilled,
    flow: flow.flow,
    chooseFlow: noFlow.length > 0,
    warnings: [
      ...agents.warnings,
      ...noFlow,
      ...hooks.warnings,
      ...mcp.warnings,
      ...(noTests ? [noTestCommandWarning(lang)] : []),
    ],
  };
}

/** Where init writes: a dry run only plans; otherwise every file that existed is copied first. */
async function installTarget(
  setup: InitSetup,
): Promise<{ readonly files: InstallFiles; readonly backups: string }> {
  const stamp = setup.environment
    .now()
    .toISOString()
    .replace(/\.\d+Z$/, "Z")
    .replaceAll(":", "-");
  const backups = await setup.git.gitPath(`common/specty/backups/${stamp}`);
  const files = installFiles(
    setup.options.dryRun === true
      ? { dryRun: true }
      : { backups: { folder: backups, root: setup.root } },
  );
  return { files, backups };
}

/** `.specty/config.yaml`, AGENTS.md, the glossary where it is missing and, in a new project, PRODUCT.md. */
async function writeProjectFiles(
  setup: InitSetup,
  fresh: boolean,
  files: InstallFiles,
  flow: GitFlow | undefined,
): Promise<Pick<Installed, "product" | "done" | "written" | "unfilled">> {
  const { environment, options, root, lang, detection } = setup;
  const configLines = await writeConfig(files, repoPaths(root).config, detection, {
    created: setup.created,
    lang,
    ...(options.language !== undefined ? { relanguage: options.language } : {}),
    ...(flow !== undefined ? { flow } : {}),
  });
  const agents = await writeAgentsMd(root, lang, detection, files);
  const glossary = setup.config?.glossary ?? defaultGlossary(lang);
  const glossaryCreated = await writeGlossary(root, glossary, lang, files);
  // A new project starts with what it is for: the interview with a person, or its questions.
  const product = fresh
    ? await writeProduct({
        root,
        name: detection.name,
        lang,
        terminal: environment.terminal,
        ask: environment.terminal.interactive && options.dryRun !== true,
        files,
      })
    : undefined;
  return {
    product,
    done: [
      ...configLines,
      agentsMdLine(agents === "created", lang),
      ...(glossaryCreated ? [glossaryLine(glossary, lang)] : []),
      ...(product === undefined ? [] : [productLine(product === "interviewed", lang)]),
    ],
    written: [
      ".specty/config.yaml",
      "AGENTS.md",
      ...(glossaryCreated ? [glossary] : []),
      ...(product === undefined ? [] : ["PRODUCT.md"]),
    ],
    unfilled: unfilledSections((await files.read(join(root, "AGENTS.md"))) ?? ""),
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
