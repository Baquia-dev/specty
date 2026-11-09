// SPDX-License-Identifier: Apache-2.0
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { exists } from "../src/io/files";
import { createGit } from "../src/io/git";
import { readSwitch, switchLog, turnSwitch } from "../src/store/switch";
import { APP, cli, git, tempRepo } from "./support";

/** Where Specty's switch log lives, as git resolves it from `cwd`, in the platform's form. */
function logOf(cwd: string): string {
  const path = git(cwd, "rev-parse", "--git-path", "common/specty/switch.jsonl").trim();
  // On Windows git writes `C:/…`: `resolve` gives it as Specty does, with `\`.
  return resolve(cwd, path);
}

const OFF = { on: false, by: "Ana", at: "2026-11-08T10:05:00.000Z" };
const ON = { on: true, by: "Luis", at: "2026-11-08T11:30:00.000Z" };

/** The log's lines as JSON, in the order they were added. */
async function linesOf(root: string): Promise<unknown[]> {
  const text = await readFile(logOf(root), "utf8");
  return text
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line));
}

describe("Specty's switch log", () => {
  it("AC1: is on with no log and with no valid line", async () => {
    const root = await tempRepo(APP);
    const repo = createGit(root);
    expect(await readSwitch(repo)).toEqual({ on: true });
    expect(await switchLog(repo)).toEqual([]);
    await mkdir(dirname(logOf(root)), { recursive: true });
    const invalid = [
      "no es json",
      JSON.stringify({ on: "no", by: "Ana", at: OFF.at }),
      JSON.stringify({ on: false }),
      JSON.stringify({ on: false, by: 3, at: OFF.at }),
      "",
    ];
    await writeFile(logOf(root), `${invalid.join("\n")}\n`);
    expect(await readSwitch(repo)).toEqual({ on: true });
    expect(await switchLog(repo)).toEqual([]);
  });

  it("AC1: adds a line for each change of state, leaves the log read-only, and none for the state it already has", async () => {
    const root = await tempRepo(APP);
    const repo = createGit(root);
    // Already on: nothing to add.
    expect(await turnSwitch(repo, ON)).toBe(false);
    expect(await switchLog(repo)).toEqual([]);

    expect(await turnSwitch(repo, OFF)).toBe(true);
    expect(await readSwitch(repo)).toEqual(OFF);
    expect((await stat(logOf(root))).mode & 0o777).toBe(0o444);
    expect(await turnSwitch(repo, { ...OFF, by: "Luis", at: ON.at })).toBe(false);

    expect(await turnSwitch(repo, ON)).toBe(true);
    expect(await readSwitch(repo)).toEqual(ON);
    expect((await stat(logOf(root))).mode & 0o777).toBe(0o444);
    expect(await linesOf(root)).toEqual([OFF, ON]);
    // The most recent first.
    expect(await switchLog(repo)).toEqual([ON, OFF]);
  });

  it("AC1: takes the state from the last valid line, skipping the others", async () => {
    const root = await tempRepo(APP);
    const repo = createGit(root);
    await mkdir(dirname(logOf(root)), { recursive: true });
    const lines = [JSON.stringify(ON), JSON.stringify(OFF), "{roto", JSON.stringify({ on: true })];
    await writeFile(logOf(root), `${lines.join("\n")}\n`);
    expect(await readSwitch(repo)).toEqual(OFF);
    expect(await switchLog(repo)).toEqual([OFF, ON]);
  });

  it("AC1: is one switch for every worktree of the clone", async () => {
    const root = await tempRepo(APP);
    const other = join(dirname(root), `${basename(root)}-otra`);
    git(root, "worktree", "add", "-q", "-b", "otra", other);
    expect(logOf(other)).toBe(logOf(root));
    expect(await turnSwitch(createGit(other), OFF)).toBe(true);
    expect(await readSwitch(createGit(root))).toEqual(OFF);
  });
});

/** Claude Code about to run `command` in `root`. */
const bash = (root: string, command: string) =>
  cli(root, ["guard", "--tool", "claude-code"], {
    stdin: JSON.stringify({
      cwd: root,
      session_id: "s1",
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command },
    }),
  });

describe("the guard and Specty's switch log", () => {
  it("AC5: rejects a shell command that names the log with the bypass rule, wherever its path comes from", async () => {
    const root = await tempRepo(APP);
    for (const command of [
      "git rev-parse --git-path common/specty/switch.jsonl",
      `echo '{"on":false}' >> "$(git rev-parse --git-common-dir)/common/specty/switch.jsonl"`,
      'node -e \'require("fs").appendFileSync(process.argv[1], "x")\' common/specty/switch.jsonl',
    ]) {
      const denied = await bash(root, command);
      expect(denied.code, command).toBe(2);
      expect(denied.err, command).toContain("specty: No se permite saltarse los hooks");
    }
    expect(await exists(logOf(root))).toBe(false);
    expect((await bash(root, "cat docs/switch.jsonl")).code).toBe(0);
  });
});
