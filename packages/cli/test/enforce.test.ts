// SPDX-License-Identifier: Apache-2.0
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

/** A repository set up with `specty init`, so the real hooks run on every commit. */
async function initialized(): Promise<string> {
  const root = await tempRepo({
    "src/app.ts": "x\n",
    "package.json": '{"name":"demo","scripts":{"test":"true"}}\n',
  });
  const result = await cli(root, ["init", "--language", "es", "--tools", "claude-code,cursor"]);
  expect(result.code).toBe(0);
  await writeFiles(root, { ".specty/config.yaml": CONFIG() });
  git(root, "add", "-A");
  expect(tryGit(root, "commit", "-q", "-m", "chore: specty").status).toBe(0);
  return root;
}

const claude = (root: string, tool: string, input: Record<string, unknown>) =>
  cli(root, ["guard", "--tool", "claude-code"], {
    stdin: JSON.stringify({ cwd: root, tool_name: tool, tool_input: input }),
  });

describe("git hooks", () => {
  it("block code without a spec and explain how to document it", async () => {
    const root = await initialized();
    await writeFiles(root, { "src/app.ts": "changed\n", "README.md": "docs\n" });
    git(root, "add", "README.md");
    expect(tryGit(root, "commit", "-q", "-m", "docs").status).toBe(0);
    git(root, "add", "src/app.ts");
    const blocked = tryGit(root, "commit", "-q", "-m", "fix");
    expect(blocked.status).toBe(1);
    expect(blocked.output).toContain("este commit incluye código gobernado sin una spec aprobada");
    expect(blocked.output).toContain("specty retro");
  });

  it("let a documented retro through, with its trailers", async () => {
    const root = await initialized();
    await writeFiles(root, { "src/app.ts": "hotfix\n" });
    git(root, "add", "src/app.ts");
    const started = await cli(root, ["retro"]);
    expect(started.out).toContain("CAMBIOS PREPARADOS:\n  src/app.ts");
    const id = /SPECTY · (\S+) · draft/.exec(started.out)?.[1] ?? "";
    const spec = (await read(root, `.specty/changes/${id}/spec.md`))
      .replace(/## Objetivo\n\n<!--[\s\S]*?-->/, "## Objetivo\n\nCorregir el valor en producción.")
      .replace(/## Motivo\n\n<!--[\s\S]*?-->/, "## Motivo\n\nEl cliente reportó un error urgente.")
      .replace(/## Riesgos\n\n<!--[\s\S]*?-->/, "## Riesgos\n\n- Ninguno");
    await writeFiles(root, { [`.specty/changes/${id}/spec.md`]: spec });
    expect((await cli(root, ["propose"])).code).toBe(0);
    expect((await cli(root, ["approve"], { terminal: person() })).out).toContain(
      "vuelve a ejecutar `git commit`",
    );
    expect(tryGit(root, "commit", "-q", "-m", "fix: valor urgente").status).toBe(0);
    expect(git(root, "log", "-1", "--format=%(trailers:key=Specty-Retro,valueonly)")).toBe("true");
    expect(git(root, "log", "-1", "--format=%(trailers:key=Specty-Change,valueonly)")).toBe(id);
    expect(git(root, "show", "--name-only", "--format=", "HEAD")).toContain(
      `.specty/archive/2026/${id}/spec.md`,
    );
  });

  it("let Specty's own commits through and record manual edits inside the scope", async () => {
    const root = await initialized();
    await cli(root, ["new", "Saludo personalizado"]);
    await writeFiles(root, { [SPEC_PATH]: SPEC });
    await cli(root, ["propose"]);
    expect((await cli(root, ["approve"], { terminal: person() })).code).toBe(0);
    await cli(root, ["next"]);
    await writeFiles(root, { "src/app.ts": "1\n" });
    expect((await cli(root, ["task", "done", "T1", "--summary", "Uno"])).code).toBe(0);
    await writeFiles(root, { "src/app.ts": "manual\n" });
    git(root, "add", "src/app.ts");
    expect(tryGit(root, "commit", "-q", "-m", "fix: retoque manual").status).toBe(0);
    expect(git(root, "log", "-1", "--format=%(trailers:key=Specty-Manual,valueonly)")).toBe("true");
    expect(git(root, "log", "-1", "--format=%(trailers:key=Specty-Change,valueonly)")).toBe(CHANGE);
    await writeFiles(root, { "lib/elsewhere.ts": "x\n" });
    git(root, "add", "lib/elsewhere.ts");
    const outside = tryGit(root, "commit", "-q", "-m", "x");
    expect(outside.status).toBe(1);
    expect(outside.output).toContain(`fuera del alcance de ${CHANGE}`);
  });
});

describe("agent guard", () => {
  it("answers Claude Code with exit code 2 and the next step", async () => {
    const root = await initialized();
    const denied = await claude(root, "Write", { file_path: `${root}/src/app.ts` });
    expect(denied.code).toBe(2);
    expect(denied.err).toContain("SIGUIENTE: ejecuta `specty next`.");
    expect((await claude(root, "Edit", { file_path: "README.md" })).code).toBe(0);
    expect((await claude(root, "Write", { file_path: "/tmp/elsewhere.ts" })).code).toBe(0);
    expect((await claude(root, "Bash", { command: "specty approve" })).code).toBe(2);
    expect(
      (await claude(root, "Bash", { command: `node "/x/specty/dist/specty.mjs" accept` })).code,
    ).toBe(2);
    expect((await claude(root, "Bash", { command: "echo hi > src/app.ts" })).code).toBe(2);
    expect((await claude(root, "Bash", { command: "pnpm test" })).code).toBe(0);
    expect((await claude(root, "Read", { file_path: "src/app.ts" })).code).toBe(0);
  });

  it("follows the active task's scope and blocks commits of code", async () => {
    const root = await initialized();
    await cli(root, ["new", "Saludo personalizado"]);
    expect((await claude(root, "Write", { file_path: SPEC_PATH })).code).toBe(0);
    await writeFiles(root, { [SPEC_PATH]: SPEC });
    await cli(root, ["propose"]);
    await cli(root, ["approve"], { terminal: person() });
    await cli(root, ["next"]);
    expect((await claude(root, "Edit", { file_path: "src/app.ts" })).code).toBe(0);
    expect((await claude(root, "Edit", { file_path: SPEC_PATH })).code).toBe(2);
    const outside = await claude(root, "Edit", { file_path: "src/other.ts" });
    expect(outside.err).toContain("specty scope add src/other.ts --task T1");
    await writeFiles(root, { "src/app.ts": "changed\n" });
    const commit = await claude(root, "Bash", { command: "git add -A && git commit -m 'x'" });
    expect(commit.code).toBe(2);
    expect(commit.err).toContain("specty task done T1");
  });

  it("answers Cursor in JSON and fails open on bad input", async () => {
    const root = await initialized();
    const ask = (event: Record<string, unknown>) =>
      cli(root, ["guard", "--tool", "cursor"], {
        stdin: JSON.stringify({ workspace_roots: [root], ...event }),
      });
    const denied = JSON.parse(
      (
        await ask({
          hook_event_name: "preToolUse",
          tool_name: "Write",
          tool_input: { file_path: "src/app.ts" },
        })
      ).out,
    );
    expect(denied.permission).toBe("deny");
    expect(denied.agent_message).toContain("SIGUIENTE:");
    const shell = JSON.parse(
      (await ask({ hook_event_name: "beforeShellExecution", command: "ls" })).out,
    );
    expect(shell).toEqual({ permission: "allow" });
    const broken = await cli(root, ["guard", "--tool", "cursor"], { stdin: "not json" });
    expect(JSON.parse(broken.out)).toEqual({ permission: "allow" });
  });
});
