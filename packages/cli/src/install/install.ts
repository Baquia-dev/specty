// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import {
  type AgentTool,
  agentsMdLine,
  defaultGlossary,
  type GitFlow,
  glossaryLine,
  type Lang,
  noTestCommandWarning,
  productLine,
  type ResolvedConfig,
  unfilledSections,
} from "@baquia-dev/specty-core";
import { type Detection, verifyCommands } from "../detect/project";
import type { Git } from "../io/git";
import type { Environment } from "../session";
import { repoPaths } from "../store/paths";
import { type InstallFiles, installFiles } from "./files";
import { flowToWrite, noFlowWarnings } from "./git-flow";
import { agentsToInstall, installHooks } from "./hooks";
import { installMcp, mcpInRepo } from "./mcp";
import { writeProduct } from "./product";
import { writeAgentsMd, writeConfig, writeGlossary } from "./project-files";
import { usageTool } from "./usage";

/** What `specty init` installs, and in which order; the command itself is `commands/init.ts`. */

export interface InitOptions {
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

/** What init works with once it knows the repository, its language and its project. */
export interface InitSetup {
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
export interface Installed {
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
export async function install(setup: InitSetup, fresh: boolean): Promise<Installed> {
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
  // The MCP server goes before AGENTS.md, whose flow asks to use its tools when it is there.
  const { tools } = agents;
  const mcp = await mcpServer(setup, tools, files);
  const project = await writeProjectFiles(setup, fresh, files, flow.flow, mcp.served);
  const noFlow = noFlowWarnings(flow, project.product !== undefined, lang);
  const hooks = await installHooks({ environment, root, git, tools, lang, files });
  // Last: ccusage, so that closing measures each change's consumption.
  const steps = [hooks, mcp, await usageTool(setup)];
  const noTests =
    setup.config?.verify.default === undefined &&
    verifyCommands(detection.commands).default === undefined;
  return {
    files,
    backups,
    product: project.product,
    done: [...project.done, ...steps.flatMap((step) => step.done)],
    written: [...project.written, ...steps.flatMap((step) => step.written)],
    unfilled: project.unfilled,
    flow: flow.flow,
    chooseFlow: noFlow.length > 0,
    warnings: [
      ...agents.warnings,
      ...noFlow,
      ...steps.flatMap((step) => step.warnings),
      ...(noTests ? [noTestCommandWarning(lang)] : []),
    ],
  };
}

/**
 * Specty's MCP server with `--mcp`, and whether the repository registers it: the entries just
 * written, or one an agent's file already had.
 */
async function mcpServer(
  setup: InitSetup,
  tools: readonly AgentTool[],
  files: InstallFiles,
): Promise<Awaited<ReturnType<typeof installMcp>> & { readonly served: boolean }> {
  const { options, root, lang, environment } = setup;
  const { invocation } = environment;
  const mcp =
    options.mcp === true
      ? await installMcp({ root, tools, invocation, files, lang })
      : { done: [], warnings: [], written: [] };
  return { ...mcp, served: mcp.written.length > 0 || (await mcpInRepo(root)) };
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

/**
 * `.specty/config.yaml`, AGENTS.md, the glossary where it is missing and, in a new project,
 * PRODUCT.md. `mcp` says whether the repository registers Specty's MCP server.
 */
async function writeProjectFiles(
  setup: InitSetup,
  fresh: boolean,
  files: InstallFiles,
  flow: GitFlow | undefined,
  mcp: boolean,
): Promise<Pick<Installed, "product" | "done" | "written" | "unfilled">> {
  const { environment, options, root, lang, detection } = setup;
  const configLines = await writeConfig(files, repoPaths(root).config, detection, {
    created: setup.created,
    lang,
    ...(options.language !== undefined ? { relanguage: options.language } : {}),
    ...(flow !== undefined ? { flow } : {}),
  });
  const agents = await writeAgentsMd(root, lang, detection, files, mcp);
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
