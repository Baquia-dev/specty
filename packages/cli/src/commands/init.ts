// SPDX-License-Identifier: Apache-2.0
import { basename, isAbsolute, relative, sep } from "node:path";
import {
  type AgentTool,
  agentsMdLine,
  backupLine,
  type CardContext,
  configLine,
  configTemplate,
  DEFAULT_CONFIG,
  dryRunCard,
  initCard,
  initRefusalCard,
  isAgentTool,
  type Lang,
  noTestCommandWarning,
  type Output,
  productLine,
} from "@baquia-dev/specty-core";
import { detectProject, projectFacts, verifyCommands } from "../detect/project";
import { commitInstall } from "../install/commit";
import { installFiles } from "../install/files";
import { installHooks } from "../install/hooks";
import { isNewProject, writeProduct } from "../install/product";
import { completeConfig, writeAgentsMd } from "../install/project-files";
import { exists } from "../io/files";
import { createGit, findRoot, pathsOf } from "../io/git";
import { bareCards, type Environment, systemLanguage } from "../session";
import { loadConfig } from "../store/config";
import { repoPaths } from "../store/paths";

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
  const output = await init(environment, {
    ...(language !== undefined ? { language } : {}),
    ...(tools !== undefined ? { tools } : {}),
    ...(options.dryRun === true ? { dryRun: true } : {}),
  });
  return { output, lang: language ?? systemLanguage(environment.env) };
}

/** `specty init`: detects the project and installs config, AGENTS.md blocks and hooks. Idempotent. */
async function init(environment: Environment, options: InitOptions): Promise<Output> {
  const fallback = options.language ?? systemLanguage(environment.env);
  const root = await findRoot(environment.cwd);
  if (root === undefined) return initRefusalCard({ reason: "no-git" }, fallback);
  const paths = repoPaths(root);
  const git = createGit(root, environment.env);
  // What already had changes stays out of init's commit: it is the person's work.
  const before = new Set(pathsOf(await git.changedSince(await git.head())));
  const existing = await loadConfig(paths);
  if (existing.kind === "invalid") {
    const issues = existing.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
    return initRefusalCard({ reason: "invalid-config", issues }, fallback);
  }
  const lang = existing.kind === "ok" ? existing.config.language : fallback;
  const cards: CardContext = { ...bareCards(environment.env), lang };
  const detection = await detectProject(root, basename(root));
  // Read before init writes anything: whether there is a project yet.
  const fresh = isNewProject(
    detection,
    await git.files(),
    existing.kind === "ok" ? existing.config : DEFAULT_CONFIG,
  );
  const stamp = environment
    .now()
    .toISOString()
    .replace(/\.\d+Z$/, "Z")
    .replaceAll(":", "-");
  const backups = await git.gitPath(`common/specty/backups/${stamp}`);
  // A dry run only plans; otherwise every file that existed is copied before it changes.
  const files = installFiles(
    options.dryRun === true ? { dryRun: true } : { backups: { folder: backups, root } },
  );
  // An existing configuration only gains the verification it lacks and the detection now finds.
  const completed =
    existing.kind === "missing"
      ? undefined
      : completeConfig((await files.read(paths.config)) ?? "", detection);
  if (existing.kind === "missing") {
    const verify = verifyCommands(detection.commands);
    await files.write(
      paths.config,
      configTemplate({ lang, verify, generated: detection.generated }),
    );
  } else if (completed !== undefined && completed.added.length > 0) {
    await files.write(paths.config, completed.text);
  }

  const tools =
    options.tools ?? (detection.tools.length > 0 ? detection.tools : ["claude-code" as const]);
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
  // Repository-relative files init writes that git tracks: they go into its commit.
  const written = [
    ".specty/config.yaml",
    "AGENTS.md",
    ...(product === undefined ? [] : ["PRODUCT.md"]),
  ];
  const done: string[] = [
    configLine(existing.kind === "missing", completed?.added ?? [], lang),
    agentsMdLine(agents === "created", lang),
    ...(product === undefined ? [] : [productLine(product === "interviewed", lang)]),
  ];
  const hooks = await installHooks({ environment, root, git, tools, lang, files });
  done.push(...hooks.done);
  written.push(...hooks.written);
  const warnings = [...hooks.warnings];
  const configured = existing.kind === "ok" && existing.config.verify.default !== undefined;
  if (!configured && verifyCommands(detection.commands).default === undefined) {
    warnings.push(noTestCommandWarning(lang));
  }
  if (options.dryRun === true) {
    const planned = files.changes.map((change) => ({
      path: shown(root, change.path),
      created: change.created,
    }));
    return dryRunCard(planned, warnings, cards);
  }
  const committed = await commitInstall(environment, written, before, existing.kind === "missing");
  done.push(...committed.done);
  if (await exists(backups)) done.push(backupLine(backups, lang));
  warnings.push(...committed.warnings);
  const facts = projectFacts(detection);
  return initCard(
    {
      done,
      detected: [
        ...facts.stacks,
        ...facts.commands.map((entry) => `${entry.label}: ${entry.command}`),
      ],
      warnings,
      ...(product === undefined ? {} : { product }),
    },
    cards,
  );
}

/** A path as the person reads it: relative to the repository, or whole when outside it. */
function shown(root: string, path: string): string {
  const inner = relative(root, path);
  return inner.startsWith("..") || isAbsolute(inner) ? path : inner.split(sep).join("/");
}
