// SPDX-License-Identifier: Apache-2.0
import { createHash } from "node:crypto";
import { join, relative, resolve } from "node:path";
import {
  geminiPointerLine,
  geminiSandboxLine,
  geminiSandboxVersionedWarning,
  geminiTrustWarning,
  geminiWorkspaceLine,
  geminiWorkspaceVersionedWarning,
  guardLine,
} from "@baquia-dev/specty-core";
import { type GuardReply, type RawAction, sentPaths, shellAction } from "../enforce/actions";
import { sharedFolders, worktreesHome } from "../flow/worktree";
import {
  excludeLocally,
  GEMINI_SETTINGS,
  hasGuard,
  missingEvents,
  removeFromJson,
  withHooks,
} from "../install/agents";
import { rewriteJson } from "../install/files";
import { GEMINI_POINTER, writePointer } from "../install/project-files";
import { isRecord, readText } from "../io/files";
import { type AgentAdapter, exitFailed, exitReply, jsonStop, type Redirect } from "./adapter";

/**
 * The events the guard listens to, each with a regular expression on `tool_name`; `BeforeAgent`,
 * with none, starts each turn.
 */
const EVENTS: Readonly<Record<string, string | undefined>> = {
  BeforeTool: "run_shell_command|write_file|replace|read_file|list_directory|glob|grep_search",
  AfterTool: "run_shell_command",
  BeforeAgent: undefined,
};

/** The field of each tool that names its file or its folder. */
const PATHS: Readonly<Record<string, string>> = {
  write_file: "file_path",
  replace: "file_path",
  read_file: "file_path",
  list_directory: "dir_path",
  glob: "dir_path",
  grep_search: "dir_path",
  run_shell_command: "dir_path",
};

/**
 * Gemini CLI (ARCHITECTURE §10): `BeforeTool`, `AfterTool` and `BeforeAgent` in its project
 * settings, shaped as Claude Code's hooks. Before an action it reads exit 2 as Claude Code does,
 * and sends stderr to the agent as the tool's error; after a command, the warning follows its
 * result (`additionalContext`). Its `PreCompress` comes before every attempt to compact, whether
 * it compacts or not, so the card comes with each turn's prompt instead. Its input brings no id
 * for the tool call.
 */
export const geminiCli: AgentAdapter = {
  tool: "gemini-cli",
  normalize,
  kind: (event) => {
    if (event.hook_event_name === "AfterTool") return "after";
    return event.hook_event_name === "BeforeAgent" ? "turn" : "before";
  },
  action,
  redirect,
  reply: (verdict, phase) => {
    if (phase === "before" && verdict.allow && verdict.input !== undefined) {
      // Gemini CLI runs the tool with this input, and tells the model a hook changed it.
      const output = {
        hookSpecificOutput: { hookEventName: "BeforeTool", tool_input: verdict.input },
      };
      return { code: 0, stdout: JSON.stringify(output), stderr: "" };
    }
    if (phase === "before" || verdict.allow) return exitReply(verdict);
    return context("AfterTool", verdict.text);
  },
  failed: exitFailed,
  inject: (texts) =>
    texts.length === 0 ? exitReply({ allow: true }) : context("BeforeAgent", texts.join("\n\n")),
  // `AfterAgent` sends the reason as a new prompt, and marks the turn it sent back.
  stop: {
    acts: (event) => event.stop_hook_active !== true,
    reply: (message) => JSON.stringify({ decision: "deny", reason: message }),
    plan: jsonStop([GEMINI_SETTINGS], (command, timeout) => (value) => {
      const hooks = isRecord(value.hooks) ? value.hooks : {};
      const current: unknown[] = Array.isArray(hooks.AfterAgent) ? hooks.AfterAgent : [];
      // Gemini CLI counts a hook's time limit in milliseconds.
      const entry = { hooks: [{ type: "command", command, timeout: timeout * 1000 }] };
      return { ...value, hooks: { ...hooks, AfterAgent: [...current, entry] } };
    }),
  },
  install: async ({ root, git, invocation, files, lang }) => {
    const local = !invocation.portable;
    const command = `${invocation.command} guard --tool gemini-cli`;
    const open = local && !(await git.isTracked(GEMINI_SETTINGS));
    const folders = await sharedFolders(git);
    const home = await worktreesHome(git);
    // Gemini CLI does not start while a folder of its workspace is missing.
    await files.folder(home);
    await rewriteJson(
      join(root, GEMINI_SETTINGS),
      (value) => withSpecty(value, command, { folders, home, add: open }),
      true,
      files,
    );
    if (local) await excludeLocally(git, GEMINI_SETTINGS, files);
    // Gemini CLI reads GEMINI.md, which imports AGENTS.md instead of copying it.
    const pointed = await writePointer(root, "GEMINI.md", GEMINI_POINTER, files);
    return {
      done: [
        guardLine("Gemini CLI", GEMINI_SETTINGS, local, lang),
        ...(open
          ? [geminiSandboxLine(GEMINI_SETTINGS, lang), geminiWorkspaceLine(GEMINI_SETTINGS, lang)]
          : []),
        ...(pointed ? [geminiPointerLine(lang)] : []),
      ],
      warnings: [
        geminiTrustWarning(lang),
        ...(open
          ? []
          : [
              geminiSandboxVersionedWarning(GEMINI_SETTINGS, folders, lang),
              geminiWorkspaceVersionedWarning(GEMINI_SETTINGS, home, lang),
            ]),
      ],
      written: [...(local ? [] : [GEMINI_SETTINGS]), "GEMINI.md"],
    };
  },
  remove: async (root, files, git) => {
    const folders = await sharedFolders(git);
    const home = await worktreesHome(git);
    const update = (value: Record<string, unknown>) =>
      withSpecty(value, undefined, { folders, home, add: false });
    await removeFromJson(root, GEMINI_SETTINGS, update, files);
  },
  doctor: async (root) => {
    const text = await readText(join(root, GEMINI_SETTINGS));
    const file = GEMINI_SETTINGS;
    if (!hasGuard(text, "gemini-cli")) {
      return { ok: [], problems: [{ code: "no-gemini-guard", file }] };
    }
    const missing = missingEvents([text], Object.keys(EVENTS), "gemini-cli");
    return missing.length === 0
      ? { ok: [{ code: "gemini-guard", file }], problems: [] }
      : { ok: [], problems: [{ code: "gemini-hooks", file, events: missing.join(", ") }] };
  },
};

/**
 * Its input, in the names the guard reads: a command runs in its `dir_path`, and a tool call is
 * known by its session and its input, the same before and after it, since none brings an id.
 */
function normalize(event: Record<string, unknown>): Record<string, unknown> {
  const input = isRecord(event.tool_input) ? event.tool_input : {};
  const folder = typeof input.dir_path === "string" && input.dir_path !== "" ? input.dir_path : "";
  const cwd =
    typeof event.cwd === "string" && folder !== "" ? resolve(event.cwd, folder) : event.cwd;
  const session = typeof event.session_id === "string" ? event.session_id : undefined;
  const call = createHash("sha256")
    .update(`${String(event.tool_name)}\n${JSON.stringify(input)}`)
    .digest("hex")
    .slice(0, 16);
  return { ...event, cwd, ...(session === undefined ? {} : { tool_use_id: `${session}-${call}` }) };
}

/**
 * Specty's in the settings, or taken out of them (no `command`): its hooks, the folders its
 * commands write in for the sandbox (`tools.sandboxAllowedPaths`), and the worktrees' folder for
 * the tools (`context.includeDirectories`). Machine paths go only in settings git does not keep.
 */
function withSpecty(
  value: Record<string, unknown>,
  command: string | undefined,
  { folders, home, add }: { folders: readonly string[]; home: string; add: boolean },
): Record<string, unknown> {
  const hooked = withHooks(value, EVENTS, "gemini-cli", command);
  const sandboxed = withPaths(hooked, ["tools", "sandboxAllowedPaths"], folders, add);
  return withPaths(sandboxed, ["context", "includeDirectories"], [home], add);
}

/**
 * `paths` in the list `section.key`, after the person's ones, or taken out of it; the list and
 * the section go when nothing is left in them.
 */
function withPaths(
  value: Record<string, unknown>,
  [section, key]: readonly [string, string],
  paths: readonly string[],
  add: boolean,
): Record<string, unknown> {
  const found = value[section];
  const inner = isRecord(found) ? found : {};
  const listed = inner[key];
  const current: unknown[] = Array.isArray(listed) ? listed : [];
  const kept = current.filter((path) => typeof path !== "string" || !paths.includes(path));
  const list = add ? [...kept, ...paths] : kept;
  const { [key]: _, ...others } = inner;
  const updated = list.length === 0 ? others : { ...others, [key]: list };
  const { [section]: __, ...rest } = value;
  return Object.keys(updated).length === 0 ? rest : { ...value, [section]: updated };
}

/** Text Gemini CLI adds for the agent: after a tool's result, or to the turn's prompt. */
function context(event: "AfterTool" | "BeforeAgent", text: string): GuardReply {
  const output = { hookSpecificOutput: { hookEventName: event, additionalContext: text } };
  return { code: 0, stdout: JSON.stringify(output), stderr: "" };
}

/**
 * The tool's whole input, with its file or folder in the conversation's folder: Gemini CLI builds
 * the tool again from the hook's input alone. It resolves a relative path from its project's
 * folder (the hook's `cwd`). Without a folder it searches every folder of its workspace, which
 * holds the worktrees' one, so a search always gets the conversation's.
 */
function redirect(
  event: Readonly<Record<string, unknown>>,
  to: Redirect,
): Record<string, unknown> | undefined {
  const name = String(event.tool_name);
  const key = PATHS[name];
  if (key === undefined) return undefined;
  const input = isRecord(event.tool_input) ? event.tool_input : {};
  const base = typeof event.cwd === "string" ? event.cwd : "";
  const given = pathOf(input[key], base);
  if (name === "run_shell_command") return commandIn(input, base, given, to);
  if (given === undefined) {
    const searches = name === "glob" || name === "grep_search";
    return searches ? { ...input, dir_path: to.folder } : undefined;
  }
  const there = to.path(given);
  return there === given ? undefined : { ...input, [key]: there };
}

/** A path the tool sent, from its project's folder; undefined when it sent none. */
function pathOf(value: unknown, base: string): string | undefined {
  return typeof value === "string" && value !== "" ? resolve(base, value) : undefined;
}

/**
 * A command in the conversation's folder, or the same folder inside it as its `dir_path`. Gemini
 * CLI refuses a `dir_path` outside its project's folder, so the command goes after a `cd`,
 * relative to that folder: it asks before a command with an absolute path that a command's
 * output showed, and `specty enter` shows it.
 */
function commandIn(
  input: Record<string, unknown>,
  base: string,
  given: string | undefined,
  to: Redirect,
): Record<string, unknown> | undefined {
  const folder = given === undefined ? to.folder : to.path(given);
  if (folder === (given ?? base) || typeof input.command !== "string") return undefined;
  const { dir_path: _, ...rest } = input;
  const there = relative(base, folder).replaceAll("'", `'\\''`);
  return { ...rest, command: `cd '${there}' && ${input.command}` };
}

function action(event: Readonly<Record<string, unknown>>): RawAction {
  const input = isRecord(event.tool_input) ? event.tool_input : {};
  switch (event.tool_name) {
    case "run_shell_command":
      return shellAction(input.command);
    case "write_file":
    case "replace":
      return { kind: "write", paths: sentPaths(input.file_path) };
    default:
      return { kind: "other" };
  }
}
