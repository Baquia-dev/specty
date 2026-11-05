// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import {
  antigravityRuleStaysLine,
  antigravityTrustWarning,
  type DoctorLine,
  guardLine,
} from "@baquia-dev/specty-core";
import { parse } from "jsonc-parser";
import { type GuardReply, type RawAction, sentPaths, shellAction } from "../enforce/actions";
import { ANTIGRAVITY_HOOKS, excludeLocally, guardMatcher, removeFromJson } from "../install/agents";
import { allowSpecty, cliRule } from "../install/antigravity-cli";
import { rewriteJson } from "../install/files";
import { isRecord, readText } from "../io/files";
import { COMMAND } from "../session";
import { type AgentAdapter, type DoctorLines, doctorLines, jsonStop } from "./adapter";

/** The name of Specty's hook among the person's in `.agents/hooks.json`. */
const HOOK = "specty";
/**
 * Its tools that change the repository (there is none to delete a file), and the one that types
 * into a task running in the background.
 */
const BEFORE_ACP =
  "run_command|write_to_file|replace_file_content|multi_replace_file_content|manage_task|view_file|list_dir|grep_search|find_by_name";
/**
 * In an editor that speaks ACP (Zed, JetBrains), it reads and writes files with these, which the
 * editor carries out: the guard sees them as it sees its own.
 */
const CLIENT_TOOLS = "client_view_file|client_edit_file|client_create_file";
/** In its CLI (`agy`), it reads a file or a folder, writes and edits with these. */
const CLI_TOOLS = "read_file|write_file|edit_file";
const TOOLS = `${BEFORE_ACP}|${CLIENT_TOOLS}|${CLI_TOOLS}`;

/**
 * Its tools that read or search, with the field that names the file or the folder: the guard
 * sees them so that a conversation that entered a change's folder reads that folder's files.
 */
const READS: Readonly<Record<string, string>> = {
  view_file: "AbsolutePath",
  list_dir: "DirectoryPath",
  grep_search: "SearchPath",
  find_by_name: "SearchDirectory",
  client_view_file: "absolute_path",
  read_file: "Path",
};

/**
 * Its tools that write a file, with the field that names it; in an ACP editor, the whole content
 * of a file it creates or replaces.
 */
const WRITES: Readonly<Record<string, string>> = {
  write_to_file: "TargetFile",
  replace_file_content: "TargetFile",
  multi_replace_file_content: "TargetFile",
  client_edit_file: "target_file",
  client_create_file: "target_file",
  write_file: "Path",
  edit_file: "Path",
};
/** How a turn the model ended comes: in its editor, and with no tool call in its CLI. */
const ENDED: ReadonlySet<string> = new Set(["model_stop", "NO_TOOL_CALL"]);
/**
 * An event of a subagent of `invoke_subagent`: its `lastUserInput` comes empty, while the main
 * conversation's brings the person's text all through its turn (agy 1.5.1).
 */
const ofSubagent = (event: Readonly<Record<string, unknown>>) => event.lastUserInput === "";
/**
 * The events the guard listens to, with the tools each one covers; `undefined` is an event that
 * takes a list of handlers, with no matcher.
 */
const EVENTS: Readonly<Record<string, string | undefined>> = {
  PreToolUse: TOOLS,
  PostToolUse: "run_command",
  PreInvocation: undefined,
};

/**
 * Antigravity (ARCHITECTURE §10): `PreToolUse`, `PostToolUse` and `PreInvocation` in the hook
 * `specty` of `.agents/hooks.json`, each calling the guard with `--event`, because its input does
 * not name the event. It reads JSON only and ignores exit codes; a hook that fails blocks the tool,
 * so every reply exits 0 and the guard's own failure allows. Its `PostToolUse` cannot reach the
 * model: the warning after a command waits for the next model call (`PreInvocation`).
 */
export const antigravity: AgentAdapter = {
  tool: "antigravity",
  normalize,
  kind: (event) => {
    if (event.hook_event_name === "PostToolUse") return "after";
    if (event.hook_event_name !== "PreInvocation") return "before";
    // Its count starts again at each message of the person: 0 is the first call of a turn.
    return event.invocationNum === 0 ? "turn" : "invocation";
  },
  action,
  // Its agent only works inside these: its own checks deny every tool elsewhere.
  workspace: (event) => {
    const folders = Array.isArray(event.workspacePaths) ? event.workspacePaths : undefined;
    return folders?.filter((folder): folder is string => typeof folder === "string");
  },
  reply: (verdict, phase) => {
    if (phase === "after") return json({});
    if (!verdict.allow) return json({ decision: "deny", reason: verdict.text });
    // Its terminal sandbox works only in the workspace; this opens git's common folder as well.
    const grants = (verdict.folders ?? []).map((folder) => `write_file(${folder})`);
    return json(
      grants.length === 0
        ? { decision: "allow" }
        : { decision: "allow", permissionOverrides: grants },
    );
  },
  failed: () => json({ decision: "allow" }),
  grants: true,
  late: "invocation",
  inject: (texts) =>
    json(
      texts.length === 0 ? {} : { injectSteps: texts.map((text) => ({ ephemeralMessage: text })) },
    ),
  stop: {
    // Only a turn the model ended (not one an error or its step limit stopped), once its
    // subagents are done: while they run, it comes with `fullyIdle: false`, and again after. A
    // subagent's own end is not checked, as Claude Code's `SubagentStop` is not heard: it closes
    // its tasks with `specty task done`, which checks them.
    acts: (event) =>
      ENDED.has(String(event.terminationReason)) && event.fullyIdle !== false && !ofSubagent(event),
    reply: (message) => JSON.stringify({ decision: "continue", reason: message }),
    pass: JSON.stringify({ decision: "stop" }),
    counts: true,
    plan: jsonStop([ANTIGRAVITY_HOOKS], (command, timeout) => (value) => {
      const ours = isRecord(value[HOOK]) ? value[HOOK] : {};
      return { ...value, [HOOK]: { ...ours, Stop: [{ type: "command", command, timeout }] } };
    }),
  },
  install: async ({ root, git, invocation, files, lang, env }) => {
    const local = !invocation.portable;
    const command = `${invocation.command} guard --tool antigravity`;
    const update = (value: Record<string, unknown>) => {
      const ours = isRecord(value[HOOK]) ? value[HOOK] : {};
      // `check --install` puts the end of turn in the same hook: rewriting the guard keeps it.
      const turn = ours.Stop === undefined ? {} : { Stop: ours.Stop };
      return { ...value, [HOOK]: { ...hookOf(command), ...turn } };
    };
    await rewriteJson(join(root, ANTIGRAVITY_HOOKS), update, true, files);
    if (local) await excludeLocally(git, ANTIGRAVITY_HOOKS, files);
    // Its permissions live in the person's folder, outside git: they are not in `written`.
    const rule = await allowSpecty(env, files, lang);
    return {
      done: [guardLine("Antigravity", ANTIGRAVITY_HOOKS, local, lang), ...rule.done],
      warnings: [antigravityTrustWarning(lang), ...rule.warnings],
      written: local ? [] : [ANTIGRAVITY_HOOKS],
    };
  },
  remove: (root, files) =>
    removeFromJson(
      root,
      ANTIGRAVITY_HOOKS,
      ({ [HOOK]: _, ...rest }: Record<string, unknown>) => rest,
      files,
    ),
  doctor: async (root, _git, env) => {
    const hooks = await hooksDoctor(root);
    // The rule of its CLI, in the person's folder, only when the person uses its CLI.
    const rule = await cliRule(env);
    if (rule === undefined) return hooks;
    const { file } = rule;
    const lines = doctorLines([
      [
        rule.there,
        { code: "antigravity-cli-rule", file },
        { code: "no-antigravity-cli-rule", file },
      ],
    ]);
    return { ok: [...hooks.ok, ...lines.ok], problems: [...hooks.problems, ...lines.problems] };
  },
  stays: async (env, lang) => {
    const rule = await cliRule(env);
    return rule?.there === true ? [antigravityRuleStaysLine(rule.file, COMMAND, lang)] : [];
  },
};

/** Specty's hooks in `.agents/hooks.json`: whether every event has one, and from which `init`. */
async function hooksDoctor(root: string): Promise<DoctorLines> {
  const value: unknown = parse((await readText(join(root, ANTIGRAVITY_HOOKS))) ?? "null");
  const ours = isRecord(value) && isRecord(value[HOOK]) ? value[HOOK] : {};
  const missing = Object.keys(EVENTS).filter(
    (event) => !JSON.stringify(ours[event] ?? null).includes(`--event ${event}`),
  );
  const file = ANTIGRAVITY_HOOKS;
  if (missing.includes("PreToolUse")) {
    return { ok: [], problems: [{ code: "no-antigravity-guard", file }] };
  }
  if (missing.length > 0) {
    return {
      ok: [],
      problems: [{ code: "antigravity-hooks", file, events: missing.join(", ") }],
    };
  }
  return { ok: [{ code: "antigravity-guard", file }], problems: outdatedMatcher(ours, file) };
}

/**
 * A guard from an older `init`: one from before `specty enter` does not see the reads, one from
 * before the ACP editors does not see what it reads and writes there, and one from before its CLI
 * does not see what it reads, writes and edits in it.
 */
function outdatedMatcher(ours: Record<string, unknown>, file: string): DoctorLine[] {
  const matcher = guardMatcher(ours, "PreToolUse", "antigravity");
  if (matcher === TOOLS) return [];
  const tools = typeof matcher === "string" ? matcher.split("|") : [];
  if (tools.includes("client_view_file")) return [{ code: "antigravity-cli", file }];
  return tools.includes("view_file")
    ? [{ code: "antigravity-acp", file }]
    : [{ code: "enter-outdated", tool: "antigravity", file }];
}

/** Specty's hook: each event calls the guard with its name. */
function hookOf(command: string): Record<string, unknown[]> {
  return Object.fromEntries(
    Object.entries(EVENTS).map(([event, matcher]) => {
      const handler = { type: "command", command: `${command} --event ${event}`, timeout: 30 };
      return [event, matcher === undefined ? [handler] : [{ matcher, hooks: [handler] }]];
    }),
  );
}

/**
 * Its input, in the names the guard reads: the conversation is the session, a step of it the tool
 * call, and the folder the command's `Cwd` or the first of the workspace.
 */
function normalize(event: Record<string, unknown>): Record<string, unknown> {
  const call = isRecord(event.toolCall) ? event.toolCall : {};
  const args = isRecord(call.args) ? call.args : {};
  const cwd = folderOf(event, args);
  const conversation = typeof event.conversationId === "string" ? event.conversationId : undefined;
  const step = typeof event.stepIdx === "number" ? event.stepIdx : undefined;
  return {
    ...event,
    tool_name: call.name,
    tool_input: args,
    ...(conversation === undefined ? {} : { session_id: conversation }),
    ...(cwd === undefined ? {} : { cwd }),
    ...(conversation === undefined || step === undefined
      ? {}
      : { tool_use_id: `${conversation}-${step}` }),
  };
}

/** Where a call runs: the command's `Cwd`, or else the first folder of the workspace. */
function folderOf(
  event: Readonly<Record<string, unknown>>,
  args: Readonly<Record<string, unknown>>,
): string | undefined {
  if (typeof args.Cwd === "string" && args.Cwd !== "") return args.Cwd;
  const folders: readonly unknown[] = Array.isArray(event.workspacePaths)
    ? event.workspacePaths
    : [];
  return folders.find((folder): folder is string => typeof folder === "string");
}

function json(value: Readonly<Record<string, unknown>>): GuardReply {
  return { code: 0, stdout: JSON.stringify(value), stderr: "" };
}

function action(event: Readonly<Record<string, unknown>>): RawAction {
  const input = isRecord(event.tool_input) ? event.tool_input : {};
  const read = READS[String(event.tool_name)];
  if (read !== undefined) return { kind: "read", paths: sentPaths(input[read]) };
  const write = WRITES[String(event.tool_name)];
  if (write !== undefined) return { kind: "write", paths: sentPaths(input[write]) };
  switch (event.tool_name) {
    case "run_command":
      return shellAction(input.CommandLine);
    // What it types into a running task, which may be a shell, is judged as a command.
    case "manage_task":
      return input.Action === "send_input" ? shellAction(input.Input) : { kind: "other" };
    default:
      return { kind: "other" };
  }
}
