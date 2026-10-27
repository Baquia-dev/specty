// SPDX-License-Identifier: Apache-2.0
import { join, resolve } from "node:path";
import {
  type DoctorLine,
  movePatch,
  opencodeGuardLine,
  opencodeWorktreesLine,
  opencodeWorktreesVersionedWarning,
  patchPaths,
} from "@baquia-dev/specty-core";
import { parse } from "jsonc-parser";
import { type RawAction, sentPaths, shellAction } from "../enforce/actions";
import { worktreesHome } from "../flow/worktree";
import { hasGuard, OPENCODE_PLUGIN } from "../install/agents";
import {
  closeWorktrees,
  installOpencode,
  OPENCODE_SETTINGS,
  opencodePluginFile,
  openWorktrees,
  planOpencodeStop,
} from "../install/opencode";
import { isRecord, readText } from "../io/files";
import type { Git } from "../io/git";
import {
  type AgentAdapter,
  blockingStop,
  doctorLines,
  exitFailed,
  exitReply,
  type Redirect,
  textCard,
} from "./adapter";

/**
 * OpenCode, through Specty's plugin (`install/opencode.ts`, ARCHITECTURE §10): it sends each tool
 * with no event name before it runs, `PostToolUse` after each shell command, and, once OpenCode
 * compacted a session, Claude Code's `SessionStart` with `compact` to get the card. The plugin
 * rejects the tool, or adds the warning to the command's result, when the guard exits with 2. At
 * the end of a turn it runs `specty hook agent-stop opencode` and reads Claude Code's answer.
 */
export const opencode: AgentAdapter = {
  tool: "opencode",
  kind: (event) => {
    if (event.hook_event_name === "PostToolUse") return "after";
    if (event.hook_event_name === "SessionStart" && event.source === "compact") return "compact";
    return "before";
  },
  action,
  redirect,
  // The plugin runs the tool with the input the guard gives back on stdout.
  reply: (verdict, phase) =>
    phase === "before" && verdict.allow && verdict.input !== undefined
      ? { code: 0, stdout: JSON.stringify({ tool_input: verdict.input }), stderr: "" }
      : exitReply(verdict),
  failed: exitFailed,
  card: textCard,
  // `check --install` turns it on in the plugin, which keeps it once a turn went back to work.
  stop: {
    ...blockingStop([]),
    plan: ({ root, files, timeout }) => planOpencodeStop(root, files, timeout),
  },
  install: async ({ root, git, invocation, files, lang }) => {
    const { file, local } = await installOpencode(root, git, invocation, files);
    // A session that entered a change's folder works there: OpenCode would ask for each action.
    const { pattern, open } = await openWorktrees(root, git, files);
    return {
      done: [
        opencodeGuardLine(file, local, lang),
        ...(open ? [opencodeWorktreesLine(OPENCODE_SETTINGS, lang)] : []),
      ],
      warnings: open ? [] : [opencodeWorktreesVersionedWarning(OPENCODE_SETTINGS, pattern, lang)],
      written: local ? [] : [file],
    };
  },
  remove: async (root, files, git) => {
    const plugin = join(root, OPENCODE_PLUGIN);
    if (hasGuard(await files.read(plugin), "opencode")) await files.remove(plugin);
    await closeWorktrees(root, git, files);
  },
  doctor: async (root, git) => {
    const plugin = await readText(join(root, OPENCODE_PLUGIN));
    const guard = hasGuard(plugin, "opencode");
    // A plugin from before the check after each command never sends `PostToolUse`, and one from
    // before the card after a compaction never listens to `session.compacted`.
    const afterShell = plugin?.includes('"PostToolUse"') === true;
    const lines = doctorLines([
      [
        guard && afterShell,
        { code: "opencode-guard", file: OPENCODE_PLUGIN },
        { code: guard ? "opencode-after-command" : "no-opencode-guard", file: OPENCODE_PLUGIN },
      ],
    ]);
    if (!guard) return lines;
    const compact = plugin?.includes("session.compacted") === true;
    return {
      ...lines,
      problems: [
        ...lines.problems,
        ...(compact ? [] : [{ code: "opencode-compact" } as const]),
        ...(await beforeEnter(plugin ?? "", root, git)),
      ],
    };
  },
  userFile: opencodePluginFile,
};

/**
 * What of the install is from before `specty enter`: a plugin that does not run the tool with the
 * input the guard gives back (`redirects`), and settings out of git without the worktrees' folder.
 */
async function beforeEnter(plugin: string, root: string, git: Git): Promise<DoctorLine[]> {
  const settings: unknown = parse((await readText(join(root, OPENCODE_SETTINGS))) ?? "");
  const permission = isRecord(settings) && isRecord(settings.permission) ? settings.permission : {};
  const rules = permission.external_directory;
  const pattern = `${await worktreesHome(git)}/**`;
  const open =
    (isRecord(rules) && Object.hasOwn(rules, pattern)) || (await git.isTracked(OPENCODE_SETTINGS));
  return [
    ...(plugin.includes("redirects: true") ? [] : [OPENCODE_PLUGIN]),
    ...(open ? [] : [OPENCODE_SETTINGS]),
  ].map((file): DoctorLine => ({ code: "enter-outdated", tool: "opencode", file }));
}

/** The fields that name a tool's file or folder, in OpenCode 2 and 1. */
const PLACES: readonly string[] = ["filePath", "path", "workdir"];

/** The tools that run in a folder, and the field that names it. */
const FOLDERS: Readonly<Record<string, string>> = {
  shell: "workdir",
  bash: "workdir",
  glob: "path",
  grep: "path",
};

/**
 * The tool's input with its files, its folder and its patch's paths in the conversation's
 * folder: OpenCode resolves a relative one from the project's folder (the event's `cwd`). A
 * search or a command without a folder gets the conversation's, when it works in another. Only
 * for a plugin that runs the tool with it (`redirects`): an older one would run the tool where
 * it was, after the guard judged it in the change's folder.
 */
function redirect(
  event: Readonly<Record<string, unknown>>,
  to: Redirect,
): Record<string, unknown> | undefined {
  if (event.redirects !== true) return undefined;
  const input = isRecord(event.tool_input) ? event.tool_input : {};
  const base = typeof event.cwd === "string" ? event.cwd : "";
  const moved = movedPaths(input, (path) => {
    const there = to.path(resolve(base, path));
    return there === resolve(base, path) ? path : there;
  });
  const folder = FOLDERS[String(event.tool_name)];
  if (folder !== undefined && moved[folder] === undefined && to.folder !== base) {
    moved[folder] = to.folder;
  }
  return Object.keys(moved).some((key) => moved[key] !== input[key]) ? moved : undefined;
}

/** The input with each file or folder it names, and each path of its patch, as `move` gives it. */
function movedPaths(
  input: Record<string, unknown>,
  move: (path: string) => string,
): Record<string, unknown> {
  const moved: Record<string, unknown> = { ...input };
  for (const key of PLACES) {
    const value = input[key];
    if (typeof value === "string" && value !== "") moved[key] = move(value);
  }
  if (typeof input.patchText === "string") moved.patchText = movePatch(input.patchText, move);
  return moved;
}

/**
 * The plugin sends the tool and its arguments as `tool_name` and `tool_input`, with the names of
 * OpenCode 2 and those of OpenCode 1 (`bash`, `filePath`, `multiedit`, `apply_patch`).
 */
function action(event: Readonly<Record<string, unknown>>): RawAction {
  const input = isRecord(event.tool_input) ? event.tool_input : {};
  switch (event.tool_name) {
    case "shell":
    case "bash":
      return shellAction(input.command);
    case "edit":
    case "write":
    case "multiedit":
      return { kind: "write", paths: [input.path, input.filePath].flatMap(sentPaths) };
    case "patch":
    case "apply_patch":
      return typeof input.patchText === "string"
        ? { kind: "files", ...patchPaths(input.patchText) }
        : { kind: "other" };
    default:
      return { kind: "other" };
  }
}
