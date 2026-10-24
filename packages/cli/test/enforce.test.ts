// SPDX-License-Identifier: Apache-2.0
import { readdir, utimes } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ARCHIVE,
  CHANGE,
  CONFIG,
  cli,
  git,
  NOW,
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
      `${ARCHIVE}/${id}/spec.md`,
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

  it("places paths after `cd` and leaves alone what it cannot place (AC2, AC3)", async () => {
    const root = await initialized();
    const bash = (command: string) => claude(root, "Bash", { command });
    const inside = await bash("cd src && echo hi > app.ts");
    expect(inside.code).toBe(2);
    expect(inside.err).toContain("src/app.ts");
    expect((await bash("cd /tmp && echo hi > app.ts")).code).toBe(0);
    expect((await bash(`cd src && echo hi > ${root}/../outside.ts`)).code).toBe(0);
    expect((await bash("S=/tmp/x && cd $S && cat > a.css <<'EOF'\nx\nEOF")).code).toBe(0);
    expect((await bash('echo hi > "$TMPDIR/a.ts"')).code).toBe(0);
  });

  it("does not read heredoc bodies as commands (AC1, AC2)", async () => {
    const root = await initialized();
    const bash = (command: string) => claude(root, "Bash", { command });
    expect((await bash("python3 - <<'PY'\n# map: old => src/app.ts\nprint(1)\nPY")).code).toBe(0);
    await writeFiles(root, { "src/app.ts": "changed\n" });
    const after = await bash("cat <<'EOF' > /dev/null\ndon't\nEOF\ngit commit -m x");
    expect(after.code).toBe(2);
    expect(after.err).toBe((await bash("git commit -m x")).err);
  });

  it("leaves alone other repositories' commits and reads of `core.hooksPath` (AC1, AC3–AC5)", async () => {
    const root = await initialized();
    const bash = (command: string) => claude(root, "Bash", { command });
    await writeFiles(root, { "src/app.ts": "changed\n" });
    const other = `${root}-otro`;
    const created = await bash(
      `mkdir -p "${other}" && cd "${other}" && git init -q && git commit -m x`,
    );
    expect(created.code).toBe(0);
    expect((await bash(`git -C "${other}" commit -m x`)).code).toBe(0);
    git(root, "worktree", "add", "-q", "--detach", `${root}-worktree`);
    expect((await bash(`cd "${root}-worktree" && git commit -m x`)).code).toBe(2);
    expect((await bash("cd src && git commit -m x")).code).toBe(2);
    expect((await bash("cd $X && git commit -m x")).code).toBe(2);
    expect((await bash("(git commit -m x)")).code).toBe(2);
    expect((await bash("git config --get core.hooksPath")).code).toBe(0);
    expect((await bash("git config core.hooksPath /dev/null")).code).toBe(2);
    const next = "(specty next 2>&1 || npx -y @baquia-dev/specty next 2>&1) | head -60";
    expect((await bash(next)).code).toBe(0);
  });

  it("never blocks paths git ignores (AC4)", async () => {
    const root = await initialized();
    await writeFiles(root, { ".gitignore": "node_modules/\ndist/\n" });
    expect((await claude(root, "Bash", { command: "rm -rf node_modules/.cache/x" })).code).toBe(0);
    expect((await claude(root, "Write", { file_path: `${root}/dist/app.js` })).code).toBe(0);
    expect((await claude(root, "Bash", { command: "rm -rf src/app.ts dist" })).code).toBe(2);
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

describe("after each Bash command", () => {
  /** The hook Claude Code runs around a Bash tool call: before it, and after it ran or failed. */
  const hook = (root: string, event: string, id: string, command = "python3 gen.py") =>
    cli(root, ["guard", "--tool", "claude-code"], {
      stdin: JSON.stringify({
        cwd: root,
        hook_event_name: event,
        tool_name: "Bash",
        tool_input: { command },
        tool_use_id: id,
      }),
    });

  async function implementing(): Promise<string> {
    const root = await initialized();
    await cli(root, ["new", "Saludo personalizado"]);
    await writeFiles(root, { [SPEC_PATH]: SPEC });
    await cli(root, ["propose"]);
    await cli(root, ["approve"], { terminal: person() });
    await cli(root, ["next"]);
    return root;
  }

  it("warns at once about what the command changed outside the task (AC1, AC3)", async () => {
    const root = await implementing();
    await writeFiles(root, { "src/before.ts": "already changed\n" });
    expect((await hook(root, "PreToolUse", "t1")).code).toBe(0);
    await writeFiles(root, { "src/app.ts": "in scope\n", "src/other.ts": "generated\n" });
    const after = await hook(root, "PostToolUse", "t1");
    expect(after.code).toBe(2);
    expect(after.err).toContain("`src/other.ts` está fuera del alcance de T1.");
    expect(after.err).toContain('specty scope add src/other.ts --task T1 --reason "<motivo>"');
    expect(after.err).not.toContain("src/before.ts");
  });

  it("stays silent when nothing outside the task changed (AC2)", async () => {
    const root = await implementing();
    await writeFiles(root, { ".gitignore": "dist/\n" });
    expect((await hook(root, "PreToolUse", "t2")).code).toBe(0);
    await writeFiles(root, { "src/app.ts": "in scope\n", "dist/app.js": "built\n" });
    expect((await hook(root, "PostToolUse", "t2")).code).toBe(0);
  });

  it("checks failed commands too, and never Specty's own (AC5, AC6)", async () => {
    const root = await implementing();
    await hook(root, "PreToolUse", "t3");
    await writeFiles(root, { "src/other.ts": "x\n" });
    expect((await hook(root, "PostToolUseFailure", "t3")).code).toBe(2);
    await hook(root, "PreToolUse", "t4", "specty next");
    await writeFiles(root, { "src/third.ts": "x\n" });
    expect((await hook(root, "PostToolUse", "t4")).code).toBe(0);
  });

  it("applies the guard's rules without a change in progress (AC4)", async () => {
    const root = await initialized();
    await hook(root, "PreToolUse", "t5");
    await writeFiles(root, { "src/app.ts": "changed\n" });
    const after = await hook(root, "PostToolUse", "t5");
    expect(after.code).toBe(2);
    expect(after.err).toContain("No hay un cambio activo");
    expect(after.err).toContain("ejecuta `specty next`");
  });

  it("leaves no snapshot behind, and stays silent without one", async () => {
    const root = await initialized();
    const shell = join(root, ".git/specty/shell");
    await writeFiles(root, { ".git/specty/shell/old.json": "{}" });
    const old = new Date(NOW.getTime() - 2 * 24 * 60 * 60 * 1000);
    await utimes(join(shell, "old.json"), old, old);
    await hook(root, "PreToolUse", "t6");
    expect(await readdir(shell)).toEqual(["t6.json"]);
    await hook(root, "PostToolUse", "t6");
    expect(await readdir(shell)).toEqual([]);
    expect((await hook(root, "PostToolUse", "unknown")).code).toBe(0);
  });
});
