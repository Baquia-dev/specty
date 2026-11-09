// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import { AGENT_NAMES, isAgentTool } from "@baquia-dev/specty-core";
import { describe, expect, it } from "vitest";
import { exists } from "../src/io/files";
import { runCli } from "../src/program";
import type { Invocation } from "../src/session";
import {
  AGENT,
  CONFIG,
  cli,
  DIST,
  NOW,
  person,
  read,
  tempRepo,
  testEnv,
  writeFiles,
} from "./support";

const PACKAGE = { "package.json": '{"name":"x","scripts":{"test":"true"}}\n' };
const CLAUDE = ".claude/settings.local.json";
const CODEX = ".codex/hooks.json";

/**
 * Each agent whose end of turn lives in a JSON hooks file, with that file: the tests' command is
 * not on PATH, so they all stay out of git.
 */
const AGENTS: readonly (readonly [string, string])[] = [
  ["claude-code", CLAUDE],
  ["codex", CODEX],
  ["cursor", ".cursor/hooks.json"],
  ["gemini-cli", ".gemini/settings.json"],
  ["windsurf", ".devin/hooks.v1.json"],
  ["antigravity", ".agents/hooks.json"],
];
const TOOLS = AGENTS.map(([tool]) => tool).join(",");

/** The command of Specty in these tests, followed by `args`. */
const specty = (args: string) => `node "${DIST}" ${args}`;

/** The ends of turn of `tool` in `file`: each command's part from `hook agent-stop` on. */
async function turns(root: string, tool: string, file: string): Promise<string[]> {
  const text = await read(root, file);
  return [...text.matchAll(new RegExp(`hook agent-stop ${tool}[^"]*`, "g"))].map(
    ([found]) => found,
  );
}

const parsed = async (root: string, file: string) => JSON.parse(await read(root, file));

/** The agents whose guard and end of turn share a single hooks file, and OpenCode's plugin. */
const SINGLE = AGENTS.filter(([tool]) => tool !== "claude-code");
const SINGLE_TOOLS = [...SINGLE.map(([tool]) => tool), "opencode"].join(",");
const PLUGIN = ".opencode/plugins/specty.js";

/** Specty with a path, as `init` calls it when it is not on PATH, and from PATH. */
const PATH_COMMAND = `node "${DIST}"`;
const LOCAL: Invocation = { command: PATH_COMMAND, portable: false, script: DIST };
const PORTABLE: Invocation = { command: "specty", portable: true };

/**
 * Runs `init` for `tools` with `invocation`, offering every agent as `cli` does: OpenCode is not
 * one this version offers.
 */
async function initWith(root: string, tools: string, invocation: Invocation): Promise<void> {
  const code = await runCli(["init", "--language", "es", "--tools", tools], {
    cwd: root,
    env: testEnv(),
    now: () => NOW,
    terminal: AGENT,
    io: { out: () => {}, err: () => {} },
    invocation,
    stdin: async () => "",
    agents: Object.keys(AGENT_NAMES).filter(isAgentTool),
  });
  expect(code).toBe(0);
}

/** The hooks of the end of turn of `tool` in `file`: each object whose `command` runs it. */
async function turnHooks(root: string, tool: string, file: string): Promise<unknown[]> {
  const found = (value: unknown): unknown[] => {
    if (Array.isArray(value)) return value.flatMap(found);
    if (typeof value !== "object" || value === null) return [];
    const entries = Object.entries(value);
    const ours = entries.some(
      ([key, item]) =>
        key === "command" && typeof item === "string" && item.includes(`hook agent-stop ${tool}`),
    );
    return ours ? [value] : entries.flatMap(([, item]) => found(item));
  };
  return found(await parsed(root, file));
}

/** The hook of the end of turn of `tool` with `command` and `timeout` seconds, in its form. */
function turnHook(tool: string, command: string, timeout: number): unknown {
  if (tool === "cursor") return { command };
  // Gemini CLI counts the time limit in milliseconds.
  return { type: "command", command, timeout: tool === "gemini-cli" ? timeout * 1000 : timeout };
}

/** A repository with `verify.timeoutSec: 900` and the plugin of OpenCode's project. */
const timedRepo = () =>
  tempRepo({
    ...PACKAGE,
    ".specty/config.yaml": `${CONFIG()}  timeoutSec: 900\n`,
    "opencode.json": "{}\n",
  });

/** A repository with a configuration, where `init` installed every agent with an end of turn. */
async function initialized(files: Readonly<Record<string, string>> = {}): Promise<string> {
  const root = await tempRepo({ ...PACKAGE, ".specty/config.yaml": CONFIG(), ...files });
  expect((await cli(root, ["init", "--language", "es", "--tools", TOOLS])).code).toBe(0);
  return root;
}

describe("the end of the turn init installs", () => {
  it("AC1: init writes each agent's end of turn with --no-check next to its guard, with its command and verify.timeoutSec, once", async () => {
    const root = await tempRepo({
      ...PACKAGE,
      ".specty/config.yaml": `${CONFIG()}  timeoutSec: 900\n`,
    });
    for (let run = 0; run < 2; run++) {
      expect((await cli(root, ["init", "--language", "es", "--tools", TOOLS])).code).toBe(0);
    }
    for (const [tool, file] of AGENTS) {
      expect(await turns(root, tool, file), tool).toEqual([`hook agent-stop ${tool} --no-check`]);
    }
    const hook = (tool: string, timeout: number) => ({
      type: "command",
      command: specty(`hook agent-stop ${tool} --no-check`),
      timeout,
    });
    expect((await parsed(root, CLAUDE)).hooks.Stop).toContainEqual({
      hooks: [hook("claude-code", 900)],
    });
    expect((await parsed(root, CODEX)).hooks.Stop).toContainEqual({ hooks: [hook("codex", 900)] });
    expect((await parsed(root, ".cursor/hooks.json")).hooks.stop).toEqual([
      { command: specty("hook agent-stop cursor --no-check") },
    ]);
    // Gemini CLI counts the time limit in milliseconds.
    expect((await parsed(root, ".gemini/settings.json")).hooks.AfterAgent).toEqual([
      { hooks: [hook("gemini-cli", 900_000)] },
    ]);
    expect((await parsed(root, ".devin/hooks.v1.json")).Stop).toEqual([
      { hooks: [hook("windsurf", 900)] },
    ]);
    expect((await parsed(root, ".agents/hooks.json")).specty.Stop).toEqual([
      hook("antigravity", 900),
    ]);
  });

  it("AC3: check --install takes the mark away in the same entry, with its time limit, and then proposes nothing of it", async () => {
    const root = await initialized();
    const plan = await cli(root, ["check", "--install", "--dry-run"]);
    for (const [tool, file] of AGENTS) {
      expect(plan.out, tool).toContain(`${file} (modificar)`);
    }
    expect(plan.out).toContain("hook agent-stop claude-code --no-check");
    expect((await cli(root, ["check", "--install"], { terminal: person() })).code).toBe(0);
    for (const [tool, file] of AGENTS) {
      expect(await turns(root, tool, file), tool).toEqual([`hook agent-stop ${tool}`]);
    }
    // The memory's net stays first, and the end of turn keeps its place and its time limit.
    expect((await parsed(root, CLAUDE)).hooks.Stop).toEqual([
      { hooks: [{ type: "command", command: specty("hook memory-stop claude-code") }] },
      {
        hooks: [{ type: "command", command: specty("hook agent-stop claude-code"), timeout: 600 }],
      },
    ]);
    expect((await parsed(root, ".gemini/settings.json")).hooks.AfterAgent).toEqual([
      {
        hooks: [
          { type: "command", command: specty("hook agent-stop gemini-cli"), timeout: 600_000 },
        ],
      },
    ]);
    expect((await cli(root, ["check", "--install", "--dry-run"])).out).not.toContain("agent-stop");
  });

  it("AC4: init leaves the end of turn that already runs the check as it was", async () => {
    const root = await initialized();
    expect((await cli(root, ["check", "--install"], { terminal: person() })).code).toBe(0);
    expect((await cli(root, ["init", "--language", "es", "--tools", TOOLS])).code).toBe(0);
    for (const [tool, file] of AGENTS) {
      expect(await turns(root, tool, file), tool).toEqual([`hook agent-stop ${tool}`]);
    }
    // An install from before `init` wrote it: `check --install` put it with its own command.
    const guard = { hooks: [{ type: "command", command: "specty guard --tool claude-code" }] };
    const turn = {
      hooks: [{ type: "command", command: "specty hook agent-stop claude-code", timeout: 600 }],
    };
    const older = await initialized({
      [CLAUDE]: JSON.stringify({ hooks: { PreToolUse: [guard], Stop: [turn] } }),
    });
    expect(await turns(older, "claude-code", CLAUDE)).toEqual(["hook agent-stop claude-code"]);
    // It keeps its check and its time limit, and calls Specty as the guard now does.
    expect((await parsed(older, CLAUDE)).hooks.Stop).toContainEqual({
      hooks: [{ ...turn.hooks[0], command: specty("hook agent-stop claude-code") }],
    });
  });

  it("init with another command of Specty puts it in each end of turn already there, with its --no-check and its time limit", async () => {
    const root = await timedRepo();
    await initWith(root, SINGLE_TOOLS, PORTABLE);
    // A time limit other than the one they have: theirs stays.
    await writeFiles(root, { ".specty/config.yaml": CONFIG() });
    for (let run = 0; run < 2; run++) await initWith(root, SINGLE_TOOLS, LOCAL);
    for (const [tool, file] of SINGLE) {
      expect(await turnHooks(root, tool, file), tool).toEqual([
        turnHook(tool, `${PATH_COMMAND} hook agent-stop ${tool} --no-check`, 900),
      ]);
    }
    const plugin = await read(root, PLUGIN);
    expect(plugin).toContain(`const SPECTY = ${JSON.stringify(PATH_COMMAND)};`);
    expect(plugin).toContain("const STOP = 900;");
    expect(plugin).toContain("const CHECK = false;");
  });

  it("init with another command of Specty keeps the check of the end of turn check --install left, with its time limit", async () => {
    const root = await timedRepo();
    await initWith(root, SINGLE_TOOLS, LOCAL);
    expect((await cli(root, ["check", "--install"], { terminal: person() })).code).toBe(0);
    await writeFiles(root, { ".specty/config.yaml": CONFIG() });
    await initWith(root, SINGLE_TOOLS, PORTABLE);
    for (const [tool, file] of SINGLE) {
      expect(await turnHooks(root, tool, file), tool).toEqual([
        turnHook(tool, `specty hook agent-stop ${tool}`, 900),
      ]);
    }
    const plugin = await read(root, PLUGIN);
    expect(plugin).toContain('const SPECTY = "specty";');
    expect(plugin).toContain("const STOP = 900;");
    expect(plugin).toContain("const CHECK = true;");
    expect((await cli(root, ["check", "--install", "--dry-run"])).out).not.toContain("agent-stop");
  });

  it("AC6: init keeps the memory's net in Claude Code and Codex, before the end of turn", async () => {
    const root = await initialized();
    for (const [tool, file] of [
      ["claude-code", CLAUDE],
      ["codex", CODEX],
    ] as const) {
      expect((await parsed(root, file)).hooks.Stop, tool).toEqual([
        { hooks: [{ type: "command", command: specty(`hook memory-stop ${tool}`) }] },
        {
          hooks: [
            {
              type: "command",
              command: specty(`hook agent-stop ${tool} --no-check`),
              timeout: 600,
            },
          ],
        },
      ]);
    }
  });

  it("AC6: uninstall takes away the end of turn init wrote, and the person's hooks stay", async () => {
    const mine = { hooks: [{ type: "command", command: "echo bye" }] };
    const root = await initialized({ [CODEX]: JSON.stringify({ hooks: { Stop: [mine] } }) });
    expect(await turns(root, "codex", CODEX)).toHaveLength(1);
    expect((await cli(root, ["uninstall"], { terminal: person({ choose: ["yes"] }) })).code).toBe(
      0,
    );
    expect(await parsed(root, CODEX)).toEqual({ hooks: { Stop: [mine] } });
    for (const [tool, file] of AGENTS) {
      if (await exists(join(root, file))) {
        expect(await read(root, file), tool).not.toContain("agent-stop");
      }
    }
  });
});
