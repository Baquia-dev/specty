// SPDX-License-Identifier: Apache-2.0
import { dirname, join } from "node:path";
import {
  cursorSandboxLine,
  cursorSandboxTrackedWarning,
  type DoctorLine,
  guardLine,
  type Lang,
} from "@baquia-dev/specty-core";
import { parse } from "jsonc-parser";
import { type GuardReply, type RawAction, sentPaths, shellAction } from "../enforce/actions";
import { worktreesHome } from "../flow/worktree";
import {
  CURSOR_HOOKS,
  CURSOR_SANDBOX,
  excludeLocally,
  isOurs,
  missingEvents,
  removeFromJson,
  withHooks,
} from "../install/agents";
import { type InstallFiles, rewriteJson } from "../install/files";
import { isRecord, readText } from "../io/files";
import type { Git } from "../io/git";
import { type AgentAdapter, type DoctorLines, doctorLines } from "./adapter";

/**
 * The events the guard listens to, with the tools each one covers: before each write, delete or
 * command, after each command, whether it succeeded or failed, and before each compaction.
 */
const EVENTS: Readonly<Record<string, string | undefined>> = {
  preToolUse: "Write|Delete|Shell",
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
  reply: (verdict, phase, card) => {
    if (phase === "after") {
      const said = [verdict.allow ? undefined : verdict.text, card].filter((part) => !!part);
      return json(said.length === 0 ? {} : { additional_context: said.join("\n\n") });
    }
    return json(
      verdict.allow
        ? { permission: "allow" }
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
    files: [CURSOR_HOOKS],
    hook: (command) => (value) => {
      const hooks = isRecord(value.hooks) ? value.hooks : {};
      const current: unknown[] = Array.isArray(hooks.stop) ? hooks.stop : [];
      return { ...value, hooks: { ...hooks, stop: [...current, { command }] } };
    },
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
    const folders = await sandboxFolders(git);
    const sandbox = (value: Record<string, unknown>) => withFolders(value, folders, false);
    await removeFromJson(root, CURSOR_SANDBOX, sandbox, files);
  },
  doctor: async (root, git) => {
    const hooks = await readText(join(root, CURSOR_HOOKS));
    const guard = guardLines(missingEvents([hooks], Object.keys(EVENTS), "cursor"));
    const listed = readwritePaths(await readText(join(root, CURSOR_SANDBOX)));
    const sandbox = doctorLines([
      [
        (await sandboxFolders(git)).every((folder) => listed.includes(folder)),
        { code: "cursor-sandbox", file: CURSOR_SANDBOX },
        { code: "no-cursor-sandbox", file: CURSOR_SANDBOX },
      ],
    ]);
    return { ok: [...guard.ok, ...sandbox.ok], problems: [...guard.problems, ...sandbox.problems] };
  },
};

/** What `doctor` says of the guard's hooks, from the events they lack. */
function guardLines(missing: readonly string[]): DoctorLines {
  if (missing.includes("preToolUse") || missing.includes("beforeShellExecution")) {
    return { ok: [], problems: [{ code: "no-cursor-guard" }] };
  }
  const after = missing.filter((event) => AFTER.has(event));
  const problems: DoctorLine[] = [];
  if (after.length > 0) problems.push({ code: "cursor-after-command", events: after.join(", ") });
  if (missing.includes("preCompact")) problems.push({ code: "cursor-compact" });
  return { ok: problems.length === 0 ? [{ code: "cursor-guard" }] : [], problems };
}

/**
 * The folders Specty's commands write in that a change's folder leaves out of the sandbox: git's
 * common folder, where every worktree commits (its `config` lives there), and the worktrees' one.
 */
async function sandboxFolders(git: Git): Promise<string[]> {
  return [dirname(await git.gitPath("config")), await worktreesHome(git)];
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
  const folders = await sandboxFolders(git);
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

function json(value: Readonly<Record<string, string>>): GuardReply {
  return { code: 0, stdout: JSON.stringify(value), stderr: "" };
}

function action(event: Readonly<Record<string, unknown>>): RawAction {
  if (event.hook_event_name === "beforeShellExecution") return shellAction(event.command);
  const input = isRecord(event.tool_input) ? event.tool_input : {};
  const paths = [input.file_path, input.path, input.target_file, input.filePath].flatMap(sentPaths);
  switch (event.tool_name) {
    case "Shell":
      return shellAction(input.command);
    case "Write":
      return { kind: "write", paths };
    case "Delete":
      return { kind: "delete", paths };
    default:
      return { kind: "other" };
  }
}
