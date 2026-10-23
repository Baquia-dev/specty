// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { APP, cli, person, SPEC, SPEC_PATH, tempRepo, writeFiles } from "./support";

/** A repository whose change is implementing T1 (`src/app.ts`, `src/app.test.ts`). */
async function implementing(): Promise<string> {
  const root = await tempRepo(APP);
  await cli(root, ["new", "Saludo personalizado"]);
  await writeFiles(root, { [SPEC_PATH]: SPEC });
  await cli(root, ["propose"]);
  await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
  await cli(root, ["next"]);
  return root;
}

/** What Specty's plugin sends the guard before an OpenCode tool runs. */
const opencode = (root: string, tool: string, input: Record<string, unknown>) =>
  cli(root, ["guard", "--tool", "opencode"], {
    stdin: JSON.stringify({
      cwd: root,
      session_id: "s1",
      tool_use_id: "c1",
      tool_name: tool,
      tool_input: input,
    }),
  });

const patch = (path: string) =>
  ["*** Begin Patch", `*** Add File: ${path}`, "+x", "*** End Patch"].join("\n");

describe("the guard in OpenCode", () => {
  it("judges edits by their path, with the names of OpenCode 2 and 1 (AC3)", async () => {
    const root = await implementing();
    const edit = { path: "src/app.ts", oldString: "hola", newString: "Hola" };
    expect((await opencode(root, "edit", edit)).code).toBe(0);
    expect(
      (await opencode(root, "write", { filePath: "src/app.test.ts", content: "x" })).code,
    ).toBe(0);
    const outside = await opencode(root, "write", { path: "src/other.ts", content: "x" });
    expect(outside.code).toBe(2);
    expect(outside.err).toContain("`src/other.ts` está fuera del alcance de T1.");
    expect(outside.err).toContain("SIGUIENTE: trabaja dentro del alcance");
    expect((await opencode(root, "multiedit", { filePath: "src/other.ts", edits: [] })).code).toBe(
      2,
    );
  });

  it("judges patches, and commands in their workdir (AC3)", async () => {
    const root = await implementing();
    expect((await opencode(root, "patch", { patchText: patch("src/other.ts") })).code).toBe(2);
    expect(
      (await opencode(root, "apply_patch", { patchText: patch("src/app.test.ts") })).code,
    ).toBe(0);
    // Inside `src/`, `echo x > other.ts` writes `src/other.ts`.
    const shell = await opencode(root, "shell", { command: "echo x > other.ts", workdir: "src" });
    expect(shell.code).toBe(2);
    expect(shell.err).toContain("`src/other.ts` está fuera del alcance de T1.");
    expect((await opencode(root, "bash", { command: "echo x > src/app.ts" })).code).toBe(0);
  });

  it("lets through the tools and events it does not know", async () => {
    const root = await implementing();
    expect((await opencode(root, "read", { path: "src/other.ts" })).code).toBe(0);
    expect((await opencode(root, "patch", {})).code).toBe(0);
    expect((await opencode(root, "shell", {})).code).toBe(0);
  });
});
