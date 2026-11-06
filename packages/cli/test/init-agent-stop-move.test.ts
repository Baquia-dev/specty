// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { runCli } from "../src/program";
import type { Invocation } from "../src/session";
import { AGENT, CONFIG, DIST, NOW, read, tempRepo, testEnv } from "./support";

const PACKAGE = { "package.json": '{"name":"x","scripts":{"test":"true"}}\n' };
const SHARED = ".claude/settings.json";
const LOCAL = ".claude/settings.local.json";

/** The command of Specty with a path, as `init` writes it when it is not on PATH. */
const PATH_COMMAND = `node "${DIST}"`;
const LOCAL_INVOCATION: Invocation = { command: PATH_COMMAND, portable: false, script: DIST };
const PORTABLE_INVOCATION: Invocation = { command: "specty", portable: true };

/** A hook entry with one command, and its time limit if it has one. */
const entry = (command: string, timeout?: number) => ({
  hooks: [{ type: "command", command, ...(timeout === undefined ? {} : { timeout }) }],
});

/** The person's own hook at the end of the turn, which stays where it is. */
const MINE = entry("echo bye");

/** A settings file as `init` left it with `command`, with the end of turn `stop` (its arguments). */
function settings(command: string, stop: string, timeout: number): string {
  return JSON.stringify({
    hooks: {
      PreToolUse: [{ matcher: "Bash", ...entry(`${command} guard --tool claude-code`) }],
      Stop: [
        MINE,
        entry(`${command} hook memory-stop claude-code`),
        entry(`${command} hook ${stop}`, timeout),
      ],
    },
  });
}

/** Runs `init` for Claude Code with `invocation`. */
async function init(root: string, invocation: Invocation): Promise<void> {
  const code = await runCli(["init", "--language", "es", "--tools", "claude-code"], {
    cwd: root,
    env: testEnv(),
    now: () => NOW,
    terminal: AGENT,
    io: { out: () => {}, err: () => {} },
    invocation,
    stdin: async () => "",
  });
  expect(code).toBe(0);
}

/** The `Stop` of a settings file. */
const stopOf = async (root: string, file: string): Promise<unknown> =>
  JSON.parse(await read(root, file)).hooks.Stop;

/** Each end of turn of Claude Code in a settings file: its command from `hook agent-stop` on. */
async function turns(root: string, file: string): Promise<string[]> {
  return [...(await read(root, file)).matchAll(/hook agent-stop claude-code[^"]*/g)].map(
    ([found]) => found,
  );
}

const repo = (files: Readonly<Record<string, string>>) =>
  tempRepo({ ...PACKAGE, ".specty/config.yaml": CONFIG(), ...files });

describe("Claude Code's end of turn when init changes the settings file of its guard", () => {
  it("going to the local file, takes it out of the shared one and leaves it once in the local one, with the guard's command and its time limit", async () => {
    const root = await repo({
      [SHARED]: settings("specty", "agent-stop claude-code --no-check", 900),
    });
    for (let run = 0; run < 2; run++) await init(root, LOCAL_INVOCATION);
    expect(await stopOf(root, SHARED)).toEqual([MINE]);
    expect(await read(root, SHARED)).not.toContain("claude-code");
    expect(await stopOf(root, LOCAL)).toEqual([
      entry(`${PATH_COMMAND} hook memory-stop claude-code`),
      entry(`${PATH_COMMAND} hook agent-stop claude-code --no-check`, 900),
    ]);
  });

  it("keeps the check of an end of turn from check --install, without --no-check", async () => {
    const root = await repo({ [SHARED]: settings("specty", "agent-stop claude-code", 900) });
    await init(root, LOCAL_INVOCATION);
    expect(await turns(root, SHARED)).toEqual([]);
    expect(await turns(root, LOCAL)).toEqual(["hook agent-stop claude-code"]);
    expect(await stopOf(root, LOCAL)).toContainEqual(
      entry(`${PATH_COMMAND} hook agent-stop claude-code`, 900),
    );
  });

  it("going to the shared file, takes it out of the local one and keeps its check there", async () => {
    const root = await repo({ [LOCAL]: settings(PATH_COMMAND, "agent-stop claude-code", 800) });
    await init(root, PORTABLE_INVOCATION);
    expect(await stopOf(root, LOCAL)).toEqual([MINE]);
    expect(await read(root, LOCAL)).not.toContain("claude-code");
    expect(await stopOf(root, SHARED)).toEqual([
      entry("specty hook memory-stop claude-code"),
      entry("specty hook agent-stop claude-code", 800),
    ]);
  });

  it("with an end of turn already in the new file, leaves that one, which takes the check of the old file's", async () => {
    const root = await repo({
      [SHARED]: settings("specty", "agent-stop claude-code", 900),
      [LOCAL]: settings(PATH_COMMAND, "agent-stop claude-code --no-check", 700),
    });
    await init(root, LOCAL_INVOCATION);
    expect(await turns(root, SHARED)).toEqual([]);
    expect(await turns(root, LOCAL)).toEqual(["hook agent-stop claude-code"]);
    expect(await stopOf(root, LOCAL)).toContainEqual(
      entry(`${PATH_COMMAND} hook agent-stop claude-code`, 700),
    );
    expect(await stopOf(root, LOCAL)).toContainEqual(MINE);
  });

  it("with an end of turn already in the new file and none checked, leaves that one with its mark", async () => {
    const root = await repo({
      [SHARED]: settings("specty", "agent-stop claude-code --no-check", 900),
      [LOCAL]: settings(PATH_COMMAND, "agent-stop claude-code --no-check", 700),
    });
    await init(root, LOCAL_INVOCATION);
    expect(await turns(root, SHARED)).toEqual([]);
    expect(await stopOf(root, LOCAL)).toContainEqual(
      entry(`${PATH_COMMAND} hook agent-stop claude-code --no-check`, 700),
    );
    expect(await turns(root, LOCAL)).toHaveLength(1);
  });
});
