// SPDX-License-Identifier: Apache-2.0
import { homedir } from "node:os";
import { join } from "node:path";
import { parseJson } from "../io/files";
import type { Git } from "../io/git";
import type { Invocation } from "../session";
import { type AgentInstall, excludeLocally, OPENCODE_PLUGIN } from "./agents";
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
 * The check at the end of each turn that `check --install` turned on stays on.
 */
export async function installOpencode(
  root: string,
  git: Git,
  invocation: Invocation,
  files: InstallFiles = installFiles(),
): Promise<AgentInstall> {
  const path = join(root, OPENCODE_PLUGIN);
  const stop = stopOf(await files.read(path));
  await files.write(path, opencodePlugin(invocation.command, stop));
  if (!invocation.portable) await excludeLocally(git, OPENCODE_PLUGIN, files);
  return { file: OPENCODE_PLUGIN, local: !invocation.portable };
}

/**
 * `check --install`: turns on the check at the end of each turn in the plugin `init` wrote, with
 * the command it already has and `timeout` seconds; nothing without the plugin, or once it is on.
 */
export async function planOpencodeStop(
  root: string,
  files: InstallFiles,
  timeout: number,
): Promise<void> {
  const path = join(root, OPENCODE_PLUGIN);
  const text = await files.read(path);
  if (text === undefined || stopOf(text) !== undefined) return;
  const command = commandOf(text);
  if (command !== undefined) await files.write(path, opencodePlugin(command, timeout));
}

/** The seconds a plugin (its text) gives the check at the end of a turn; undefined while off. */
function stopOf(text: string | undefined): number | undefined {
  const found = text?.match(/^const STOP = (\d+);$/m)?.[1];
  return found === undefined ? undefined : Number(found);
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

function opencodePlugin(specty: string, stop: number | undefined): string {
  return PLUGIN.replace("__SPECTY__", () => JSON.stringify(specty))
    .replace("__GUARD__", () => JSON.stringify(`${specty} guard --tool opencode`))
    .replace("__STOP__", () => (stop === undefined ? "null" : String(stop)));
}

/**
 * The plugin: a module without dependencies for OpenCode 2 (`setup`) and 1 (`server`). Before
 * each tool, in a folder that uses Specty, it sends the event to the guard without blocking
 * OpenCode, and rejects the tool with the guard's reason when it answers 2. After each shell
 * command it asks the guard what changed, and adds its warning to the result the model reads.
 * After a compaction it brings back the card of `specty next`: OpenCode 1 gets it in the session,
 * asking for no reply, and OpenCode 2 in the next model call. With `STOP` on, at the end of each
 * turn it runs `specty hook agent-stop opencode` and sends its report back to the session. It
 * never throws outside a blocked tool; if Specty cannot run, everything goes through.
 */
const PLUGIN = `// Specty's guard for OpenCode. \`specty init\` writes this file and rewrites it, and
// \`specty check --install\` turns on the check at the end of each turn (STOP).
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const SPECTY = __SPECTY__;
const GUARD = __GUARD__;
// Seconds \`specty check --changed\` may take at the end of a turn; null while it is off.
const STOP = __STOP__;
const SHELL = new Set(["shell", "bash"]);
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

// At the end of a turn, with STOP on: the report that sends the agent back to work while
// \`specty check --changed\` fails. A turn it already sent back may end, so it never loops.
async function endOfTurn(directory, session) {
  try {
    if (STOP === null || typeof directory !== "string" || typeof session !== "string") return undefined;
    if (!usesSpecty(directory)) return undefined;
    const active = SENT_BACK.delete(session);
    const event = { hook_event_name: "Stop", cwd: directory, session_id: session, stop_hook_active: active };
    const { stdout } = await run(SPECTY + " hook agent-stop opencode", directory, event, STOP);
    const reply = JSON.parse(stdout.trim() || "null");
    if (reply?.decision !== "block" || typeof reply.reason !== "string") return undefined;
    SENT_BACK.add(session);
    return reply.reason;
  } catch {
    return undefined;
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
          if (event?.type !== "session.idle") continue;
          const session = event.properties?.sessionID;
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
      // turn, the report sends the agent back to work.
      event: async ({ event }) => {
        try {
          const id = event?.properties?.sessionID;
          if (event?.type === "session.compacted") {
            const text = await card(directory, id);
            const body = { noReply: true, parts: [{ type: "text", text }] };
            if (text !== undefined) await session?.prompt({ path: { id }, body });
          } else if (event?.type === "session.idle") {
            const text = await endOfTurn(directory, id);
            const body = { parts: [{ type: "text", text }] };
            if (text !== undefined) await session?.prompt({ path: { id }, body });
          }
        } catch {}
      },
    };
  },
};
`;
