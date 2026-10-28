// SPDX-License-Identifier: Apache-2.0
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CHANGE,
  CONFIG,
  cli,
  git,
  person,
  read,
  SPEC,
  SPEC_PATH,
  tempRepo,
  tryGit,
  writeFiles,
} from "./support";

/** The hook Claude Code runs around a Bash tool call: before it, and after it ran. */
const hook = (root: string, event: string, id: string) =>
  cli(root, ["guard", "--tool", "claude-code"], {
    stdin: JSON.stringify({
      cwd: root,
      hook_event_name: event,
      tool_name: "Bash",
      tool_input: { command: "python3 gen.py" },
      tool_use_id: id,
    }),
  });

/** SPEC's change with T1 active, in a repository set up with `specty init`. */
async function implementing(): Promise<string> {
  const root = await tempRepo({ "src/app.ts": "x\n" });
  expect((await cli(root, ["init", "--language", "es", "--tools", "claude-code"])).code).toBe(0);
  await writeFiles(root, { ".specty/config.yaml": CONFIG() });
  git(root, "add", "-A");
  expect(tryGit(root, "commit", "-q", "-m", "chore: specty").status).toBe(0);
  await cli(root, ["new", "Saludo personalizado"]);
  await writeFiles(root, { [SPEC_PATH]: SPEC });
  await cli(root, ["propose"]);
  await cli(root, ["approve"], { terminal: person() });
  await cli(root, ["next"]);
  return root;
}

/** The change's lock, as a live Specty process holds it while it runs. */
async function lockedBy(root: string, pid: number): Promise<void> {
  const path = join(
    root,
    git(root, "rev-parse", "--git-path", `common/specty/locks/${CHANGE}.json`),
  );
  await mkdir(dirname(path), { recursive: true });
  const holder = { pid, command: "task done", folder: root, at: "2026-10-28T04:38:48.160Z" };
  await writeFile(path, JSON.stringify(holder));
}

const AUDIT = `.specty/changes/${CHANGE}/audit.jsonl`;

describe("after a Bash command, what Specty writes", () => {
  it("AC1: does not count in the change's folder while a live Specty process holds its lock", async () => {
    const root = await implementing();
    const spectyWrites = async () =>
      writeFiles(root, { [AUDIT]: `${await read(root, AUDIT)}{"event":"task.verified"}\n` });
    // Nobody holds the lock: whatever changed it, the command did.
    await hook(root, "PreToolUse", "t1");
    await spectyWrites();
    expect((await hook(root, "PostToolUse", "t1")).code).toBe(2);
    await lockedBy(root, process.ppid);
    await hook(root, "PreToolUse", "t2");
    await spectyWrites();
    expect((await hook(root, "PostToolUse", "t2")).code).toBe(0);
    // Outside the change's folder, it still counts.
    await hook(root, "PreToolUse", "t3");
    await spectyWrites();
    await writeFiles(root, { "src/other.ts": "x\n" });
    const after = await hook(root, "PostToolUse", "t3");
    expect(after.code).toBe(2);
    expect(after.err).toContain("src/other.ts");
    expect(after.err).not.toContain("audit.jsonl");
  });
});
