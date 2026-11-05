// SPDX-License-Identifier: Apache-2.0
import { getPriority } from "node:os";
import { describe, expect, it } from "vitest";
import { APP, cli, person, read, SPEC, SPEC_PATH, tempRepo, writeFiles } from "./support";

/** A verification that writes its own priority to `.git/priority-<name>`. */
const writes = (name: string) =>
  `node -e "require('fs').writeFileSync('.git/priority-${name}', String(require('os').getPriority()))"`;

const CONFIG = `version: 1\nlanguage: es\ngit:\n  worktrees: false\nverify:\n  default: ${JSON.stringify(writes("tarea"))}\n  full: ${JSON.stringify(writes("completa"))}\n`;

/** The priority of a command run with less priority, from this process. */
const LOW = String(Math.max(getPriority(), 10));

/** SPEC's change, approved, with T1 active. */
async function approved(): Promise<string> {
  const root = await tempRepo({ ...APP, ".specty/config.yaml": CONFIG });
  await cli(root, ["new", "Saludo personalizado"]);
  await writeFiles(root, { [SPEC_PATH]: SPEC });
  await cli(root, ["propose"]);
  await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
  await cli(root, ["next"]);
  return root;
}

describe("the verifications Specty runs", () => {
  it("run a task's command with less priority (AC2)", async () => {
    const root = await approved();
    await writeFiles(root, { "src/app.ts": "1\n" });
    expect((await cli(root, ["task", "done", "T1", "--summary", "Uno"])).code).toBe(0);
    expect(await read(root, ".git/priority-tarea")).toBe(LOW);
  });

  it("run the full one of accept with less priority (AC3)", async () => {
    const root = await approved();
    await writeFiles(root, { "src/app.ts": "1\n" });
    await cli(root, ["task", "done", "T1", "--summary", "Uno"]);
    await writeFiles(root, { "src/app.ts": "2\n" });
    await cli(root, ["task", "done", "T2", "--summary", "Dos"]);
    expect((await cli(root, ["accept"], { terminal: person() })).code).toBe(0);
    expect(await read(root, ".git/priority-completa")).toBe(LOW);
  });
});
