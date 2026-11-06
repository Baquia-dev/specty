// SPDX-License-Identifier: Apache-2.0
import { homedir } from "node:os";
import { join } from "node:path";
import { formerWorktreesHome } from "../flow/worktree";
import { isRecord, parseJson } from "../io/files";
import type { Git } from "../io/git";
import type { Invocation } from "../session";
import { type AgentInstall, excludeLocally, OPENCODE_PLUGIN, removeFromJson } from "./agents";
import { type InstallFiles, installFiles } from "./files";

/**
 * OpenCode's global plugin file (`$XDG_CONFIG_HOME/opencode`, or `~/.config/opencode`), which
 * Specty only reads: its plugin goes in the project (ADR 0013).
 */
export function opencodePluginFile(env: NodeJS.ProcessEnv): string {
  const config = env.XDG_CONFIG_HOME || join(env.HOME ?? homedir(), ".config");
  return join(config, "opencode", "plugins", "specty.js");
}

/**
 * Specty's plugin in the project's `.opencode/plugins/`, which OpenCode 1 and 2 load like the
 * global one. A plugin with a machine path stays out of git, and `new` copies it to each worktree.
 * Its end of turn stays as it was, and the check in it that `check --install` turned on too.
 */
export async function installOpencode(
  root: string,
  git: Git,
  invocation: Invocation,
  files: InstallFiles = installFiles(),
): Promise<AgentInstall> {
  const path = join(root, OPENCODE_PLUGIN);
  const text = await files.read(path);
  await files.write(path, opencodePlugin(invocation.command, stopOf(text), checkOf(text)));
  if (!invocation.portable) await excludeLocally(git, OPENCODE_PLUGIN, files);
  return { file: OPENCODE_PLUGIN, local: !invocation.portable };
}

/** OpenCode's settings in the project's `.opencode/`, which it reads with `opencode.json`. */
const OPENCODE_SETTINGS = ".opencode/opencode.jsonc";

/**
 * Takes out the rule an older `init` wrote so that OpenCode worked in the worktrees' folder beside
 * the project (ADR 0018), and the file once nothing is left in it. Settings without that rule stay
 * as they are.
 */
export async function closeWorktrees(root: string, git: Git, files: InstallFiles): Promise<void> {
  const pattern = `${await formerWorktreesHome(git)}/**`;
  await removeFromJson(root, OPENCODE_SETTINGS, (value) => withoutRule(value, pattern), files);
}

/** The settings without the rule that allows `pattern`; what is left empty goes. */
function withoutRule(value: Record<string, unknown>, pattern: string): Record<string, unknown> {
  const permission = isRecord(value.permission) ? value.permission : {};
  const rules = permission.external_directory;
  if (!isRecord(rules) || !Object.hasOwn(rules, pattern)) return value;
  const { [pattern]: _, ...others } = rules;
  const { external_directory: __, ...rest } = permission;
  const kept = Object.keys(others).length === 0 ? rest : { ...rest, external_directory: others };
  const { permission: ___, ...settings } = value;
  return Object.keys(kept).length === 0 ? settings : { ...settings, permission: kept };
}

/**
 * `init`: turns on the end of each turn in the plugin it wrote (`STOP`), with `timeout` seconds,
 * which sends the agent back to `specty wait` while the change waits for the person; nothing
 * without the plugin, or once it is on.
 */
export function planOpencodeTurn(
  root: string,
  files: InstallFiles,
  timeout: number,
): Promise<void> {
  return turnOn(root, files, timeout, false);
}

/**
 * `check --install`: turns on the end of each turn in the plugin `init` wrote and, in it, `specty
 * check --changed` (`CHECK`), with `timeout` seconds; nothing without the plugin, or once both are
 * on.
 */
export function planOpencodeStop(
  root: string,
  files: InstallFiles,
  timeout: number,
): Promise<void> {
  return turnOn(root, files, timeout, true);
}

/** Writes the plugin again with its command, its end of turn on and, with `check`, its check. */
async function turnOn(
  root: string,
  files: InstallFiles,
  timeout: number,
  check: boolean,
): Promise<void> {
  const path = join(root, OPENCODE_PLUGIN);
  const text = await files.read(path);
  if (text === undefined) return;
  const checks = checkOf(text);
  if (stopOf(text) !== undefined && (checks || !check)) return;
  const command = commandOf(text);
  if (command !== undefined)
    await files.write(path, opencodePlugin(command, timeout, check || checks));
}

/** The seconds a plugin (its text) gives its end of turn; undefined while off. */
function stopOf(text: string | undefined): number | undefined {
  const found = text?.match(/^const STOP = (\d+);$/m)?.[1];
  return found === undefined ? undefined : Number(found);
}

/**
 * Whether a plugin (its text) runs `specty check --changed` at the end of a turn: one from before
 * `CHECK` did whenever its `STOP` was on, since only `check --install` turned it on.
 */
function checkOf(text: string | undefined): boolean {
  const found = text?.match(/^const CHECK = (true|false);$/m)?.[1];
  return found === undefined ? stopOf(text) !== undefined : found === "true";
}

/** How a plugin (its text) calls Specty: `SPECTY`, or an older plugin's `GUARD` without its tool. */
function commandOf(text: string): string | undefined {
  const constant = (name: string): string | undefined => {
    const value = parseJson(text.match(new RegExp(`^const ${name} = (".*");$`, "m"))?.[1] ?? "");
    return typeof value === "string" ? value : undefined;
  };
  const guard = constant("GUARD");
  const suffix = " guard --tool opencode";
  return (
    constant("SPECTY") ?? (guard?.endsWith(suffix) ? guard.slice(0, -suffix.length) : undefined)
  );
}

function opencodePlugin(specty: string, stop: number | undefined, check: boolean): string {
  return PLUGIN.replace("__SPECTY__", () => JSON.stringify(specty))
    .replace("__GUARD__", () => JSON.stringify(`${specty} guard --tool opencode`))
    .replace("__STOP__", () => (stop === undefined ? "null" : String(stop)))
    .replace("__CHECK__", () => String(check));
}

/**
 * The plugin: a module without dependencies for OpenCode 2 (`setup`) and 1 (`server`). Before
 * each tool, in a folder that uses Specty, it sends the event to the guard without blocking
 * OpenCode, and rejects the tool with the guard's reason when it answers 2. After each shell
 * command it asks the guard what changed, and adds its warning to the result the model reads.
 * After a compaction it brings back the card of `specty next`: OpenCode 1 gets it in the session,
 * asking for no reply, and OpenCode 2 in the next model call. With `STOP` on, at the end of each
 * turn (`session.idle`; in OpenCode 2.2, `session.execution.succeeded`) it runs `specty hook
 * agent-stop opencode`, with `--no-check` while `CHECK` is off, and sends its report back to the
 * session; in OpenCode 1, not to a subagent's child session (one with `parentID`). It never
 * throws outside a blocked tool; if Specty cannot run, everything goes through.
 */
const PLUGIN = `// Specty's guard for OpenCode. \`specty init\` writes this file and rewrites it, with the end of
// each turn on (STOP), and \`specty check --install\` turns on the check in it (CHECK).
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const SPECTY = __SPECTY__;
const GUARD = __GUARD__;
// Seconds the end of a turn may take; null while it is off.
const STOP = __STOP__;
// Whether the end of a turn runs \`specty check --changed\` too, besides the rule of \`specty wait\`.
const CHECK = __CHECK__;
const SHELL = new Set(["shell", "bash"]);
// The events that end a turn in OpenCode 2: the beta's, and 2.2's, which has no \`session.idle\`.
const TURN_ENDS = new Set(["session.idle", "session.execution.succeeded"]);
// Sessions sent back to work at the end of their last turn: their next end of turn may end.
const SENT_BACK = new Set();

function usesSpecty(directory) {
  for (let folder = resolve(directory); ; folder = dirname(folder)) {
    if (existsSync(join(folder, ".specty", "config.yaml"))) return true;
    if (dirname(folder) === folder) return false;
  }
}

// Runs Specty with an event on stdin, killed after \`seconds\` when given; it never rejects.
function run(command, directory, event, seconds) {
  return new Promise((done) => {
    const child = spawn(command, { shell: true, cwd: directory, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = seconds ? setTimeout(() => child.kill(), seconds * 1000) : undefined;
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", () => {
      clearTimeout(timer);
      done({ code: 0, stdout: "", stderr: "" });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      done({ code, stdout, stderr });
    });
    child.stdin.on("error", () => {});
    child.stdin.end(JSON.stringify(event));
  });
}

// \`redirects\`: this plugin runs the tool with the input the guard gives back.
async function check(directory, tool, input, session, call) {
  if (typeof directory !== "string" || !usesSpecty(directory)) return;
  const event = {
    cwd: directory,
    session_id: session,
    tool_use_id: call,
    tool_name: tool,
    tool_input: input,
    redirects: true,
  };
  const { code, stdout, stderr } = await run(GUARD, directory, event);
  if (code === 2) throw new Error(stderr.trim() || "specty: blocked");
  redirect(input, stdout);
}

// The guard moved the tool to the folder of the change its conversation entered: OpenCode runs
// it with this same object, so it changes in place.
function redirect(input, stdout) {
  try {
    const moved = JSON.parse(stdout.trim() || "null")?.tool_input;
    if (!moved || typeof moved !== "object" || !input || typeof input !== "object") return;
    for (const key of Object.keys(input)) if (!(key in moved)) delete input[key];
    Object.assign(input, moved);
  } catch {}
}

async function warning(directory, tool, input, session, call) {
  try {
    if (typeof directory !== "string" || !SHELL.has(tool) || !usesSpecty(directory)) return undefined;
    const event = {
      hook_event_name: "PostToolUse",
      cwd: directory,
      session_id: session,
      tool_use_id: call,
      tool_name: tool,
      tool_input: input,
    };
    const { code, stderr } = await run(GUARD, directory, event);
    return code === 2 && stderr.trim() !== "" ? stderr.trim() : undefined;
  } catch {
    return undefined;
  }
}

// What \`specty next\` says, for a session OpenCode just compacted; undefined outside Specty.
async function card(directory, session) {
  try {
    if (typeof directory !== "string" || typeof session !== "string") return undefined;
    if (!usesSpecty(directory)) return undefined;
    const event = { hook_event_name: "SessionStart", source: "compact", cwd: directory, session_id: session };
    const { code, stdout } = await run(GUARD, directory, event);
    return code === 0 && stdout.trim() !== "" ? stdout : undefined;
  } catch {
    return undefined;
  }
}

// At the end of a turn, with STOP on: the report that sends the agent back to work while the
// change waits for the person with no \`specty wait\` or, with CHECK on, while
// \`specty check --changed\` fails. A turn it already sent back may end, so it never loops. A
// subagent's session (\`child\` says which) is not checked, as Specty does not check Claude
// Code's SubagentStop: the report reaches the main session at the end of its own turn.
async function endOfTurn(directory, session, child) {
  try {
    if (STOP === null || typeof directory !== "string" || typeof session !== "string") return undefined;
    if (!usesSpecty(directory) || (await child?.(session))) return undefined;
    const active = SENT_BACK.delete(session);
    const event = { hook_event_name: "Stop", cwd: directory, session_id: session, stop_hook_active: active };
    const hook = SPECTY + " hook agent-stop opencode" + (CHECK ? "" : " --no-check");
    const { stdout } = await run(hook, directory, event, STOP);
    const reply = JSON.parse(stdout.trim() || "null");
    if (reply?.decision !== "block" || typeof reply.reason !== "string") return undefined;
    SENT_BACK.add(session);
    return reply.reason;
  } catch {
    return undefined;
  }
}

// Whether OpenCode 1's session \`id\` is a subagent's: \`task\` opens it with the session that
// launched it in \`parentID\`. When OpenCode does not give the session, it counts as a main one.
async function isChild(sessions, id) {
  try {
    const parent = (await sessions?.get?.({ path: { id } }))?.data?.parentID;
    return typeof parent === "string" && parent !== "";
  } catch {
    return false;
  }
}

// The parts the model reads, as OpenCode 2 builds them when a tool gives none.
function parts(result) {
  if (typeof result.content === "string") return [{ type: "text", text: result.content }];
  if (Array.isArray(result.content) && result.content.length > 0) return result.content;
  if (result.output === undefined) return [];
  const text = typeof result.output === "string" ? result.output : JSON.stringify(result.output);
  return [{ type: "text", text }];
}

export default {
  id: "specty",
  // OpenCode 2.
  async setup(ctx) {
    const directory = ctx.location.directory;
    await ctx.tool.hook("execute.before", (event) =>
      check(directory, event.tool, event.input, event.sessionID, event.id),
    );
    await ctx.tool.hook("execute.after", async (event) => {
      const text = await warning(directory, event.tool, event.input, event.sessionID, event.id);
      if (text === undefined || event.status !== "completed" || !event.result) return;
      event.result.content = [...parts(event.result), { type: "text", text }];
    });
    // After a compaction, the next model call carries the card among its system parts.
    const compacted = new Set();
    await ctx.session?.hook?.("compaction", (event) => {
      compacted.add(event.sessionID);
    });
    await ctx.session?.hook?.("context", async (event) => {
      if (!compacted.delete(event.sessionID)) return;
      const text = await card(directory, event.sessionID);
      if (text !== undefined) event.system.push({ type: "text", text });
    });
    if (STOP === null || typeof ctx.event?.subscribe !== "function") return undefined;
    const controller = new AbortController();
    void (async () => {
      try {
        for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
          if (!TURN_ENDS.has(event?.type)) continue;
          // The beta gives the session in \`properties\`, and OpenCode 2.2 in \`data\`.
          const session = (event.data ?? event.properties)?.sessionID;
          const reason = await endOfTurn(directory, session);
          if (reason !== undefined) await ctx.session?.prompt?.({ sessionID: session, text: reason });
        }
      } catch {}
    })();
    return () => controller.abort();
  },
  // OpenCode 1.
  async server(input) {
    const directory = input?.directory ?? process.cwd();
    const session = input?.client?.session;
    return {
      "tool.execute.before": (info, output) =>
        check(directory, info.tool, output.args, info.sessionID, info.callID),
      "tool.execute.after": async (info, output) => {
        const text = await warning(directory, info.tool, info.args, info.sessionID, info.callID);
        if (text === undefined || typeof output?.output !== "string") return;
        output.output = output.output + "\\n\\n" + text;
      },
      // The card goes into the session once it compacted, asking for no reply; at the end of a
      // turn, the report sends the agent back to work, except a subagent's.
      event: async ({ event }) => {
        try {
          const id = event?.properties?.sessionID;
          if (event?.type === "session.compacted") {
            const text = await card(directory, id);
            const body = { noReply: true, parts: [{ type: "text", text }] };
            if (text !== undefined) await session?.prompt({ path: { id }, body });
          } else if (event?.type === "session.idle") {
            const text = await endOfTurn(directory, id, (child) => isChild(session, child));
            const body = { parts: [{ type: "text", text }] };
            if (text !== undefined) await session?.prompt({ path: { id }, body });
          }
        } catch {}
      },
    };
  },
};
`;
