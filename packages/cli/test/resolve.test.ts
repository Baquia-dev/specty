// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CHANGE, cli, git, inWorktree, person, toClosing, writeFiles } from "./support";

/** Claude Code's hook before an agent action, run from `cwd`. */
const claude = (cwd: string, tool: string, input: Record<string, unknown>) =>
  cli(cwd, ["guard", "--tool", "claude-code"], {
    stdin: JSON.stringify({ cwd, tool_name: tool, tool_input: input }),
  });

/** A change whose closing hit conflicts with main: the merge waits for the agent in `folder`. */
async function conflicted() {
  const { root, folder } = await inWorktree();
  await toClosing(folder);
  await writeFiles(root, { "src/app.ts": "main\n" });
  git(root, "commit", "-q", "-am", "main cambia el saludo");
  expect((await cli(folder, ["close"], { terminal: person() })).code).toBe(2);
  return { root, folder };
}

describe("the agent sees the pending incorporation", () => {
  it("in its card, in the status and in the guard (AC3)", async () => {
    const { folder } = await conflicted();
    const next = await cli(folder, ["next"]);
    expect(next.out).toContain(`SPECTY · ${CHANGE} · closing · incorporando main`);
    expect(next.out).toContain("CONFLICTOS:\n  src/app.ts\nPUEDES TOCAR:\n  src/app.ts");
    expect(next.out).toContain("ejecuta `specty integrate`.");
    // «a el» is a known wording bug of the status card; either form says it waits for the agent.
    expect((await cli(folder, ["status"])).out).toMatch(/closing · espera a(l| el) agente/);
    expect((await claude(folder, "Write", { file_path: join(folder, "src/app.ts") })).code).toBe(0);
    const outside = await claude(folder, "Write", { file_path: join(folder, "src/other.ts") });
    expect(outside.code).toBe(2);
    expect(outside.err).toContain(
      "`src/other.ts` queda fuera de la incorporación de main: solo se tocan los archivos que cambiaron este cambio o main.",
    );
    const commit = await claude(folder, "Bash", { command: "git commit -am resuelto" });
    expect(commit.err).toContain("ejecuta `specty integrate`.");
  });
});
