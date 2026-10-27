// SPDX-License-Identifier: Apache-2.0
import { join, resolve } from "node:path";
import {
  cursorSandboxLine,
  cursorSandboxTrackedWarning,
  type DoctorLine,
  guardLine,
  type Lang,
} from "@baquia-dev/specty-core";
import { parse } from "jsonc-parser";
import { cwdOf, type GuardReply, type RawAction, sentPaths, shellAction } from "../enforce/actions";
import { sharedFolders } from "../flow/worktree";
import {
  CURSOR_HOOKS,
  CURSOR_SANDBOX,
  excludeLocally,
  guardMatcher,
  isOurs,
  missingEvents,
  removeFromJson,
  withHooks,
} from "../install/agents";
import { type InstallFiles, rewriteJson } from "../install/files";
import { isRecord, readText } from "../io/files";
import type { Git } from "../io/git";
import {
  type AgentAdapter,
  type DoctorLines,
  doctorLines,
  jsonStop,
  type Redirect,
} from "./adapter";

/**
 * The events the guard listens to, with the tools each one covers: before each write, delete or
 * command, after each command, whether it succeeded or failed, and before each compaction.
 */
const EVENTS: Readonly<Record<string, string | undefined>> = {
  preToolUse: "Write|Delete|Shell|Read|Grep",
  beforeShellExecution: undefined,
  postToolUse: "Shell",
  postToolUseFailure: "Shell",
  preCompact: undefined,
};
/** After a command, whether it succeeded or failed. */
const AFTER: ReadonlySet<unknown> = new Set(["postToolUse", "postToolUseFailure"]);

/**
 * Cursor (ARCHITECTURE §10): `preToolUse`, `beforeShellExecution`, `postToolUse`,
 * `postToolUseFailure`, `preCompact` and `stop`. It always reads JSON: a `permission` before an
 * action, and after a command, which it cannot block, an `additional_context` that goes into the
 * conversation. `preCompact` only observes, so the card after a compaction comes with the next
 * command's result instead.
 */
export const cursor: AgentAdapter = {
  tool: "cursor",
  kind: (event) => {
    if (event.hook_event_name === "preCompact") return "compacting";
    return AFTER.has(event.hook_event_name) ? "after" : "before";
  },
  action,
  redirect,
  reply: (verdict, phase, card) => {
    if (phase === "after") {
      const said = [verdict.allow ? undefined : verdict.text, card].filter((part) => !!part);
      return json(said.length === 0 ? {} : { additional_context: said.join("\n\n") });
    }
    return json(
      verdict.allow
        ? {
            permission: "allow",
            ...(verdict.input === undefined ? {} : { updated_input: verdict.input }),
          }
        : {
            permission: "deny",
            user_message: `specty: ${verdict.reason}`,
            agent_message: verdict.text,
          },
    );
  },
  failed: (message) => json({ permission: "allow", user_message: message }),
  // Its own `loop_limit` keeps the turn from looping, and only a completed turn counts.
  stop: {
    acts: (event) => event.status === "completed",
    reply: (message) => JSON.stringify({ followup_message: message }),
    plan: jsonStop([CURSOR_HOOKS], (command) => (value) => {
      const hooks = isRecord(value.hooks) ? value.hooks : {};
      const current: unknown[] = Array.isArray(hooks.stop) ? hooks.stop : [];
      return { ...value, hooks: { ...hooks, stop: [...current, { command }] } };
    }),
  },
  install: async ({ root, git, invocation, files, lang }) => {
    const local = !invocation.portable;
    const command = `${invocation.command} guard --tool cursor`;
    await rewriteJson(join(root, CURSOR_HOOKS), (value) => withGuard(value, command), true, files);
    if (local) await excludeLocally(git, CURSOR_HOOKS, files);
    const sandbox = await installSandbox(root, git, files, lang);
    return {
      done: [guardLine("Cursor", CURSOR_HOOKS, local, lang), ...sandbox.done],
      warnings: sandbox.warnings,
      written: local ? [] : [CURSOR_HOOKS],
    };
  },
  remove: async (root, files, git) => {
    const hooks = (value: Record<string, unknown>) => withHooks(value, EVENTS, "cursor", undefined);
    await removeFromJson(root, CURSOR_HOOKS, hooks, files);
    // A sandbox file the person keeps in git was never Specty's to change.
    if (await git.isTracked(CURSOR_SANDBOX)) return;
    const folders = await sharedFolders(git);
    const sandbox = (value: Record<string, unknown>) => withFolders(value, folders, false);
    await removeFromJson(root, CURSOR_SANDBOX, sandbox, files);
  },
  doctor: async (root, git) => {
    const guard = guardLines(await readText(join(root, CURSOR_HOOKS)));
    const listed = readwritePaths(await readText(join(root, CURSOR_SANDBOX)));
    const sandbox = doctorLines([
      [
        (await sharedFolders(git)).every((folder) => listed.includes(folder)),
        { code: "cursor-sandbox", file: CURSOR_SANDBOX },
        { code: "no-cursor-sandbox", file: CURSOR_SANDBOX },
      ],
    ]);
    return { ok: [...guard.ok, ...sandbox.ok], problems: [...guard.problems, ...sandbox.problems] };
  },
};

/**
 * What `doctor` says of the guard's hooks (their file's text): the events they lack, and a
 * `preToolUse` from before `specty enter`, which does not see the reads.
 */
function guardLines(text: string | undefined): DoctorLines {
  const missing = missingEvents([text], Object.keys(EVENTS), "cursor");
  if (missing.includes("preToolUse") || missing.includes("beforeShellExecution")) {
    return { ok: [], problems: [{ code: "no-cursor-guard" }] };
  }
  const after = missing.filter((event) => AFTER.has(event));
  const problems: DoctorLine[] = [];
  if (after.length > 0) problems.push({ code: "cursor-after-command", events: after.join(", ") });
  if (missing.includes("preCompact")) problems.push({ code: "cursor-compact" });
  const value: unknown = parse(text ?? "");
  if (
    guardMatcher(isRecord(value) ? value.hooks : {}, "preToolUse", "cursor") !== EVENTS.preToolUse
  ) {
    problems.push({ code: "enter-outdated", tool: "cursor", file: CURSOR_HOOKS });
  }
  return { ok: problems.length === 0 ? [{ code: "cursor-guard" }] : [], problems };
}

/**
 * Cursor's sandbox with Specty's folders, kept out of git because they are machine paths. A file
 * the person keeps in git stays as it is, and `init` says what to add to it.
 */
async function installSandbox(
  root: string,
  git: Git,
  files: InstallFiles,
  lang: Lang,
): Promise<{ readonly done: string[]; readonly warnings: string[] }> {
  const folders = await sharedFolders(git);
  if (await git.isTracked(CURSOR_SANDBOX)) {
    const listed = readwritePaths(await files.read(join(root, CURSOR_SANDBOX)));
    const there = folders.every((folder) => listed.includes(folder));
    return {
      done: [],
      warnings: there ? [] : [cursorSandboxTrackedWarning(CURSOR_SANDBOX, folders, lang)],
    };
  }
  const update = (value: Record<string, unknown>) => withFolders(value, folders, true);
  await rewriteJson(join(root, CURSOR_SANDBOX), update, true, files);
  await excludeLocally(git, CURSOR_SANDBOX, files);
  return { done: [cursorSandboxLine(CURSOR_SANDBOX, lang)], warnings: [] };
}

/** The read-write paths a sandbox file (its text) lists. */
function readwritePaths(text: string | undefined): unknown[] {
  const value: unknown = text === undefined ? undefined : parse(text);
  return isRecord(value) && Array.isArray(value.additionalReadwritePaths)
    ? value.additionalReadwritePaths
    : [];
}

/**
 * Adds `folders` after the paths the file already listed, or takes them out; a list left empty
 * goes too.
 */
function withFolders(
  value: Record<string, unknown>,
  folders: readonly string[],
  add: boolean,
): Record<string, unknown> {
  const { additionalReadwritePaths: listed, ...rest } = value;
  const current: unknown[] = Array.isArray(listed) ? listed : [];
  const paths = add
    ? [...current, ...folders.filter((folder) => !current.includes(folder))]
    : current.filter((path) => !folders.includes(String(path)));
  return paths.length === 0 ? rest : { ...rest, additionalReadwritePaths: paths };
}

/** The guard in each of its events, in `.cursor/hooks.json` (`version: 1`). */
function withGuard(value: Record<string, unknown>, command: string): Record<string, unknown> {
  const hooks = isRecord(value.hooks) ? value.hooks : {};
  const updated = Object.entries(EVENTS).map(([name, matcher]) => {
    const current = Array.isArray(hooks[name]) ? hooks[name] : [];
    const entry = matcher === undefined ? { command } : { command, matcher };
    return [name, [...current.filter((item: unknown) => !isOurs(item, "cursor")), entry]];
  });
  return {
    ...value,
    version: typeof value.version === "number" ? value.version : 1,
    hooks: { ...hooks, ...Object.fromEntries(updated) },
  };
}

function json(value: Readonly<Record<string, unknown>>): GuardReply {
  return { code: 0, stdout: JSON.stringify(value), stderr: "" };
}

/**
 * A command of its `Shell` tool after a `cd` to the conversation's folder, or to the same folder
 * inside it that its `working_directory` names. Its forum says Cursor applies `updated_input`
 * only to `Shell`, so its files are blocked with the right path instead. `beforeShellExecution`
 * cannot rewrite: the guard judges the command as it comes, which passes once it goes there.
 */
function redirect(
  event: Readonly<Record<string, unknown>>,
  to: Redirect,
): Record<string, unknown> | undefined {
  if (event.hook_event_name !== "preToolUse" || event.tool_name !== "Shell") return undefined;
  const input = isRecord(event.tool_input) ? event.tool_input : {};
  if (typeof input.command !== "string") return undefined;
  const base = cwdOf(event, "");
  const named = typeof input.working_directory === "string" && input.working_directory !== "";
  const current = named ? resolve(base, String(input.working_directory)) : base;
  const folder = named ? to.path(current) : to.folder;
  if (folder === current) return undefined;
  return { ...input, command: `cd '${folder.replaceAll("'", `'\\''`)}' && ${input.command}` };
}

/** Its tools that write, delete or read a file, by the action each one is. */
const FILE_TOOLS: Readonly<Record<string, "write" | "delete" | "read">> = {
  Write: "write",
  Delete: "delete",
  Read: "read",
  Grep: "read",
};

function action(event: Readonly<Record<string, unknown>>): RawAction {
  if (event.hook_event_name === "beforeShellExecution") return shellAction(event.command);
  const input = isRecord(event.tool_input) ? event.tool_input : {};
  if (event.tool_name === "Shell") return shellAction(input.command);
  const files = FILE_TOOLS[String(event.tool_name)];
  if (files === undefined) return { kind: "other" };
  const paths = [input.file_path, input.path, input.target_file, input.filePath].flatMap(sentPaths);
  return { kind: files, paths };
}
