// SPDX-License-Identifier: Apache-2.0
import { homedir } from "node:os";
import { join } from "node:path";
import type { Invocation } from "../session";
import { type InstallFiles, installFiles } from "./files";

/**
 * Specty's plugin in OpenCode's global configuration (`$XDG_CONFIG_HOME/opencode`, or
 * `~/.config/opencode`), like Codex's hook: one install serves every worktree, and the project's
 * formatters and linters never see its code.
 */
export function opencodePluginFile(env: NodeJS.ProcessEnv): string {
  const config = env.XDG_CONFIG_HOME || join(env.HOME ?? homedir(), ".config");
  return join(config, "opencode", "plugins", "specty.js");
}

export async function installOpencode(
  env: NodeJS.ProcessEnv,
  invocation: Invocation,
  files: InstallFiles = installFiles(),
): Promise<string> {
  const file = opencodePluginFile(env);
  await files.write(file, opencodePlugin(`${invocation.command} guard --tool opencode`));
  return file;
}

/**
 * The plugin: a module without dependencies for OpenCode 2 (`setup`) and 1 (`server`). Before
 * each tool, in a folder that uses Specty, it sends the event to the guard without blocking
 * OpenCode, and rejects the tool with the guard's reason when it answers 2. After each shell
 * command it asks the guard what changed, and adds its warning to the result the model reads; it
 * never throws there. If the guard cannot run, the tool goes through, as with every other agent.
 */
export function opencodePlugin(command: string): string {
  return `// Specty's guard for OpenCode. \`specty init\` writes this file and rewrites it.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const GUARD = ${JSON.stringify(command)};
const SHELL = new Set(["shell", "bash"]);

function usesSpecty(directory) {
  for (let folder = resolve(directory); ; folder = dirname(folder)) {
    if (existsSync(join(folder, ".specty", "config.yaml"))) return true;
    if (dirname(folder) === folder) return false;
  }
}

function guard(directory, event) {
  return new Promise((done) => {
    const child = spawn(GUARD, { shell: true, cwd: directory, stdio: ["pipe", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", () => done({ code: 0, stderr: "" }));
    child.on("close", (code) => done({ code, stderr }));
    child.stdin.on("error", () => {});
    child.stdin.end(JSON.stringify(event));
  });
}

async function check(directory, tool, input, session, call) {
  if (typeof directory !== "string" || !usesSpecty(directory)) return;
  const event = { cwd: directory, session_id: session, tool_use_id: call, tool_name: tool, tool_input: input };
  const { code, stderr } = await guard(directory, event);
  if (code === 2) throw new Error(stderr.trim() || "specty: blocked");
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
    const { code, stderr } = await guard(directory, event);
    return code === 2 && stderr.trim() !== "" ? stderr.trim() : undefined;
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
  },
  // OpenCode 1.
  async server(input) {
    const directory = input?.directory ?? process.cwd();
    return {
      "tool.execute.before": (info, output) =>
        check(directory, info.tool, output.args, info.sessionID, info.callID),
      "tool.execute.after": async (info, output) => {
        const text = await warning(directory, info.tool, info.args, info.sessionID, info.callID);
        if (text === undefined || typeof output?.output !== "string") return;
        output.output = \`\${output.output}\\n\\n\${text}\`;
      },
    };
  },
};
`;
}
