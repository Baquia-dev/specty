// SPDX-License-Identifier: Apache-2.0
// What init does so that closing can measure each change's consumption (ARCHITECTURE §13): ccusage,
// which Specty does not carry (a native binary per platform) and never fetches on its own. The
// first time, in a Node project, it asks the person to add it as a development dependency;
// otherwise, or to an agent, it says how to install it. Later, `doctor` warns while closing would
// not find it.
import { join } from "node:path";
import {
  ccusageAddedLine,
  ccusageFailedWarning,
  ccusageHint,
  ccusageQuestion,
  type DoctorLine,
} from "@baquia-dev/specty-core";
import { detectStacks, type Stack } from "../detect/stack";
import { execute } from "../io/exec";
import { exists, isRecord, parseJson, readText } from "../io/files";
import type { InitSetup } from "./install";

/** The ccusage whose JSON `flow/usage.ts` reads. */
const CCUSAGE = "ccusage@20.0.45";
/** Outside Node, the person installs it for the whole system. */
const GLOBAL = `npm i -g ${CCUSAGE}`;
/** How each Node package manager adds a development dependency. */
const ADD: Readonly<Record<string, readonly string[]>> = {
  pnpm: ["add", "-D"],
  npm: ["install", "--save-dev"],
  yarn: ["add", "--dev"],
  bun: ["add", "--dev"],
};
const LOCKFILES = ["pnpm-lock.yaml", "package-lock.json", "yarn.lock", "bun.lock", "bun.lockb"];
/** A package manager on a slow network still finishes. */
const TIMEOUT_MS = 5 * 60_000;

/** What the step did, the files it wrote for init's commit, and what it advises. */
export interface UsageStep {
  readonly done: readonly string[];
  readonly written: readonly string[];
  readonly warnings: readonly string[];
}

const NOTHING: UsageStep = { done: [], written: [], warnings: [] };

/**
 * ccusage for a new configuration: added when a person accepts it in a Node project, or a line
 * that says how to install it. Nothing when it is there, the configuration existed or it is a
 * dry run.
 */
export async function usageTool(setup: InitSetup): Promise<UsageStep> {
  const { environment, root, lang } = setup;
  if (!setup.created || setup.options.dryRun === true || (await hasCcusage(root))) return NOTHING;
  const add = await addCommand(root, setup.detection.stacks);
  if (add === undefined) return { ...NOTHING, warnings: [ccusageHint(GLOBAL, lang)] };
  const command = [add.tool, ...add.args].join(" ");
  const { terminal } = environment;
  if (!terminal.interactive) return { ...NOTHING, warnings: [ccusageHint(command, lang)] };
  if (!(await terminal.confirm(ccusageQuestion(command, lang)))) return NOTHING;
  const result = await execute(add.tool, add.args, {
    cwd: root,
    env: environment.env,
    timeoutMs: TIMEOUT_MS,
  });
  if (result.code !== 0) return { ...NOTHING, warnings: [ccusageFailedWarning(command, lang)] };
  const lockfiles = [];
  for (const file of LOCKFILES) if (await exists(join(root, file))) lockfiles.push(file);
  return { done: [ccusageAddedLine(lang)], written: ["package.json", ...lockfiles], warnings: [] };
}

/**
 * `doctor`'s warning when closing would not find ccusage (`flow/usage.ts`): neither in
 * `node_modules/.bin` nor on the PATH. It carries the command init would give.
 */
export async function usageDoctor(root: string, env: NodeJS.ProcessEnv): Promise<DoctorLine[]> {
  if (await exists(join(root, "node_modules", ".bin", "ccusage"))) return [];
  if ((await execute("sh", ["-c", "command -v ccusage"], { cwd: root, env })).code === 0) return [];
  const add = await addCommand(root, await detectStacks(root));
  const command = add === undefined ? GLOBAL : [add.tool, ...add.args].join(" ");
  return [{ code: "no-ccusage", command }];
}

/** How the project's Node package manager adds ccusage, with `-w` at a pnpm workspace's root. */
async function addCommand(
  root: string,
  stacks: readonly Stack[],
): Promise<{ readonly tool: string; readonly args: readonly string[] } | undefined> {
  const tool = stacks.find(
    (stack) =>
      (stack.language === "typescript" || stack.language === "javascript") &&
      stack.tool !== undefined &&
      ADD[stack.tool] !== undefined,
  )?.tool;
  const add = tool === undefined ? undefined : ADD[tool];
  if (tool === undefined || add === undefined) return undefined;
  const workspace = tool === "pnpm" && (await exists(join(root, "pnpm-workspace.yaml")));
  return { tool, args: [...add, ...(workspace ? ["-w"] : []), CCUSAGE] };
}

/** Whether the root `package.json` already depends on ccusage. */
async function hasCcusage(root: string): Promise<boolean> {
  const manifest = parseJson(await readText(join(root, "package.json")));
  if (!isRecord(manifest)) return false;
  return [manifest.dependencies, manifest.devDependencies].some(
    (deps) => isRecord(deps) && deps.ccusage !== undefined,
  );
}
