// SPDX-License-Identifier: Apache-2.0
import { basename } from "node:path";
import {
  type AgentTool,
  agentsMdLine,
  backupLine,
  type CardContext,
  configLine,
  configTemplate,
  DEFAULT_CONFIG,
  dryRunCard,
  type InitRefusal,
  initCard,
  initRefusalCard,
  isAgentTool,
  type Lang,
  languageChoices,
  languageLine,
  languageQuestion,
  noTestCommandWarning,
  type Output,
  productLine,
  type ResolvedConfig,
} from "@baquia-dev/specty-core";
import { type Detection, detectProject, projectFacts, verifyCommands } from "../detect/project";
import { commitInstall } from "../install/commit";
import { type InstallFiles, installFiles } from "../install/files";
import { installHooks } from "../install/hooks";
import { isNewProject, writeProduct } from "../install/product";
import { completeConfig, withLanguage, writeAgentsMd } from "../install/project-files";
import { exists } from "../io/files";
import { createGit, findRoot, type Git, pathsOf } from "../io/git";
import { bareCards, type Environment, systemLanguage } from "../session";
import { loadConfig } from "../store/config";
import { repoPaths, shownPath } from "../store/paths";

interface InitOptions {
  readonly language?: Lang;
  /** Agent tools to configure; by default, the ones detected in the repository. */
  readonly tools?: readonly AgentTool[];
  /** Only say what it would create or change: nothing is written or committed. */
  readonly dryRun?: boolean;
}

/** `specty init` as typed: reads its options, and says which language its output uses. */
export async function initCommand(
  environment: Environment,
  options: { readonly language?: string; readonly tools?: string; readonly dryRun?: boolean },
): Promise<{ readonly output: Output; readonly lang: Lang }> {
  const language =
    options.language === "es" || options.language === "en" ? options.language : undefined;
  const tools = options.tools
    ?.split(",")
    .map((tool) => tool.trim())
    .filter(isAgentTool);
  return init(environment, {
    ...(language !== undefined ? { language } : {}),
    ...(tools !== undefined ? { tools } : {}),
    ...(options.dryRun === true ? { dryRun: true } : {}),
  });
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
  const installed = await install(setup, fresh);
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
}

/** The configuration, AGENTS.md, PRODUCT.md for a new project, and each agent's hooks. */
async function install(setup: InitSetup, fresh: boolean): Promise<Installed> {
  const { environment, options, root, git, lang, detection } = setup;
  const { files, backups } = await installTarget(setup);
  const project = await writeProjectFiles(setup, fresh, files);
  const tools =
    options.tools ?? (detection.tools.length > 0 ? detection.tools : ["claude-code" as const]);
  const hooks = await installHooks({ environment, root, git, tools, lang, files });
  const noTests =
    setup.config?.verify.default === undefined &&
    verifyCommands(detection.commands).default === undefined;
  return {
    files,
    backups,
    product: project.product,
    done: [...project.done, ...hooks.done],
    written: [...project.written, ...hooks.written],
    warnings: [...hooks.warnings, ...(noTests ? [noTestCommandWarning(lang)] : [])],
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

/** `.specty/config.yaml`, AGENTS.md and, in a new project, PRODUCT.md. */
async function writeProjectFiles(
  setup: InitSetup,
  fresh: boolean,
  files: InstallFiles,
): Promise<Pick<Installed, "product" | "done" | "written">> {
  const { environment, options, root, lang, detection } = setup;
  const configLines = await writeConfig(files, repoPaths(root).config, detection, {
    created: setup.created,
    lang,
    ...(options.language !== undefined ? { relanguage: options.language } : {}),
  });
  const agents = await writeAgentsMd(root, lang, detection, files);
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
      ...(product === undefined ? [] : [productLine(product === "interviewed", lang)]),
    ],
    written: [".specty/config.yaml", "AGENTS.md", ...(product === undefined ? [] : ["PRODUCT.md"])],
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
  const done = [
    ...installed.done,
    ...result.done,
    ...(backedUp ? [backupLine(installed.backups, lang)] : []),
  ];
  const warnings = [...installed.warnings, ...result.warnings];
  const facts = projectFacts(detection);
  const detected = [
    ...facts.stacks,
    ...facts.commands.map((entry) => `${entry.label}: ${entry.command}`),
  ];
  const { product } = installed;
  const view = { done, detected, warnings, ...(product === undefined ? {} : { product }) };
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

/**
 * Writes `.specty/config.yaml`: a new one, or the existing one with the verification it lacks and
 * the language `--language` asks for. Returns the lines that say what it did.
 */
async function writeConfig(
  files: InstallFiles,
  path: string,
  detection: Detection,
  options: { readonly created: boolean; readonly lang: Lang; readonly relanguage?: Lang },
): Promise<readonly string[]> {
  const { lang } = options;
  if (options.created) {
    const verify = verifyCommands(detection.commands);
    await files.write(path, configTemplate({ lang, verify, generated: detection.generated }));
    return [configLine(true, [], lang)];
  }
  // An existing configuration only gains the verification it lacks and the detection now finds.
  const current = (await files.read(path)) ?? "";
  const completed = completeConfig(current, detection);
  const text =
    options.relanguage === undefined
      ? completed.text
      : withLanguage(completed.text, options.relanguage);
  if (text !== current) await files.write(path, text);
  if (text === completed.text) return [configLine(false, completed.added, lang)];
  const added = completed.added.length > 0 ? [configLine(false, completed.added, lang)] : [];
  return [languageLine(lang), ...added];
}
