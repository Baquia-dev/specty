// SPDX-License-Identifier: Apache-2.0
import {
  COMMIT_TYPES,
  developLine,
  flowChoices,
  flowQuestion,
  GIT_FLOWS,
  type GitFlow,
  type Lang,
  noFlowWarning,
} from "@baquia-dev/specty-core";
import type { Git } from "../io/git";
import { COMMAND, type Environment } from "../session";

/** Git Flow's own branches, besides `develop`. */
const GIT_FLOW_PREFIXES = ["feature/", "bugfix/", "release/", "hotfix/"];

/**
 * The flow the repository already follows, by its branches here and in its remotes: Git Flow by
 * git-flow's configuration, `develop` or its prefixes; GitHub Flow by branches named after a
 * commit type; Specty's own by `specty/` branches. Trunk leaves no trace, so it is never found.
 */
export async function detectFlow(git: Git): Promise<GitFlow | undefined> {
  if ((await git.config("gitflow.branch.develop")) !== undefined) return "gitflow";
  const refs = await git.output([
    "for-each-ref",
    "--format=%(refname)",
    "refs/heads",
    "refs/remotes",
  ]);
  const branches = refs
    .split("\n")
    .map((ref) => ref.replace(/^refs\/heads\//, "").replace(/^refs\/remotes\/[^/]+\//, ""));
  const any = (named: (branch: string) => boolean) => branches.some(named);
  if (
    any((branch) => branch === "develop" || GIT_FLOW_PREFIXES.some((p) => branch.startsWith(p)))
  ) {
    return "gitflow";
  }
  if (any((branch) => COMMIT_TYPES.some((type) => branch.startsWith(`${type}/`)))) return "github";
  return any((branch) => branch.startsWith("specty/")) ? "specty" : undefined;
}

/** The flow init writes, if any, and whether the repository ends with one. */
export interface FlowChoice {
  readonly flow?: GitFlow;
  readonly chosen: boolean;
}

/**
 * The flow init writes: `--git-flow`'s (`given`). Otherwise only in a configuration init creates,
 * as with the language, so an installation never changes its branches' names unasked: a person's
 * answer, offered with the detected one first, or the detected one if they cancel or nobody can
 * be asked. An existing configuration keeps its flow, or the lack of one (`configured`).
 */
export async function flowToWrite(options: {
  readonly environment: Environment;
  readonly git: Git;
  readonly given: GitFlow | undefined;
  readonly configured: GitFlow | undefined;
  readonly created: boolean;
  readonly dryRun: boolean;
  readonly lang: Lang;
}): Promise<FlowChoice> {
  if (options.given !== undefined) return { flow: options.given, chosen: true };
  if (!options.created) return { chosen: options.configured !== undefined };
  const { environment, lang } = options;
  const detected = await detectFlow(options.git);
  const answer =
    environment.terminal.interactive && !options.dryRun
      ? await environment.terminal.choose(flowQuestion(detected, lang), flowChoices(detected, lang))
      : undefined;
  const flow = GIT_FLOWS.find((candidate) => candidate === answer) ?? detected;
  return flow === undefined ? { chosen: false } : { flow, chosen: true };
}

/** A new project, whose PRODUCT.md init just wrote, ended without a flow: it says how to choose. */
export function noFlowWarnings(choice: FlowChoice, newProject: boolean, lang: Lang): string[] {
  return newProject && !choice.chosen ? [noFlowWarning(COMMAND, lang)] : [];
}

/**
 * Under Git Flow, changes start from `develop` and go to it: when it is missing here, init makes
 * it from the remote's, which it then follows, or else from where it just committed. Returns what
 * it did; nothing when `develop` was there or could not be made, such as with no commit yet.
 */
export async function ensureDevelop(git: Git, lang: Lang): Promise<readonly string[]> {
  const known = async (ref: string) =>
    (await git.run(["rev-parse", "--verify", "-q", ref])).code === 0;
  if (await known("refs/heads/develop")) return [];
  const remote = await known("refs/remotes/origin/develop");
  const args = remote ? ["--track", "develop", "origin/develop"] : ["develop", "HEAD"];
  if ((await git.run(["branch", ...args])).code !== 0) return [];
  return [developLine(remote ? "origin/develop" : ((await git.branch()) ?? "HEAD"), lang)];
}
