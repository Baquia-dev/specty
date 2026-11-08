// SPDX-License-Identifier: Apache-2.0
import { appendFile, mkdir } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { describe, expect, it } from "vitest";
import { exists } from "../src/io/files";
import {
  APP,
  CHANGE,
  CONFIG,
  cli,
  git,
  person,
  SPEC,
  SPEC_PATH,
  stateIn,
  tempRepo,
  tryGit,
  writeFiles,
} from "./support";

/** A path under the git directory, as git resolves it from `cwd`. */
function gitPath(cwd: string, path: string): string {
  const resolved = git(cwd, "rev-parse", "--git-path", path).trim();
  return isAbsolute(resolved) ? resolved : join(cwd, resolved);
}

/** The person turns Specty on or off: one more line in its switch log. */
async function turn(root: string, on: boolean): Promise<void> {
  const log = gitPath(root, "common/specty/switch.jsonl");
  await mkdir(dirname(log), { recursive: true });
  const at = on ? "2026-11-08T11:30:00.000Z" : "2026-11-08T10:05:00.000Z";
  await appendFile(log, `${JSON.stringify({ on, by: "Ana", at })}\n`);
}

/** Claude Code's hook for `event` with `input`, in conversation `session`. */
const claude = (
  root: string,
  event: string,
  input: Readonly<Record<string, unknown>>,
  session = "s1",
) =>
  cli(root, ["guard", "--tool", "claude-code"], {
    stdin: JSON.stringify({ cwd: root, session_id: session, hook_event_name: event, ...input }),
  });

/** Claude Code about to write `src/app.ts`. */
const writeApp = (root: string, session = "s1") =>
  claude(
    root,
    "PreToolUse",
    { tool_name: "Write", tool_input: { file_path: "src/app.ts", content: "x\n" } },
    session,
  );

/** Cursor about to write `src/app.ts`. */
const cursorWrite = (root: string) =>
  cli(root, ["guard", "--tool", "cursor"], {
    stdin: JSON.stringify({
      cwd: root,
      conversation_id: "c1",
      hook_event_name: "preToolUse",
      tool_name: "Write",
      tool_input: { file_path: "src/app.ts", content: "x\n" },
    }),
  });

/** Claude Code's shell command `id`, before and after it runs. */
const bash = (root: string, phase: "PreToolUse" | "PostToolUse", id: string, session = "s1") =>
  claude(
    root,
    phase,
    { tool_name: "Bash", tool_use_id: id, tool_input: { command: "ls" } },
    session,
  );

const QUIET = { code: 0, out: "", err: "" };

// Put together from parts, so that this file does not trip `specty check`.
const TODO = "TODO";

/** A repository whose change waits for the person to approve its spec. */
async function inReview(): Promise<string> {
  const root = await tempRepo(APP);
  await cli(root, ["new", "Saludo personalizado"]);
  await writeFiles(root, { [SPEC_PATH]: SPEC });
  expect((await cli(root, ["propose"])).code).toBe(0);
  return root;
}

/** A repository set up with `specty init`, so the real git hooks run on every commit. */
async function initialized(): Promise<string> {
  const root = await tempRepo({
    "src/app.ts": "x\n",
    "package.json": '{"name":"demo","scripts":{"test":"true"}}\n',
  });
  const result = await cli(root, ["init", "--language", "es", "--tools", "claude-code"]);
  expect(result.code).toBe(0);
  await writeFiles(root, { ".specty/config.yaml": CONFIG() });
  git(root, "add", "-A");
  expect(tryGit(root, "commit", "-q", "-m", "chore: specty").status).toBe(0);
  return root;
}

describe("the guard with Specty off", () => {
  it("AC2: lets every action of any agent through, with no denial, warning or card", async () => {
    const root = await tempRepo(APP);
    expect((await writeApp(root)).code).toBe(2);
    expect(JSON.parse((await cursorWrite(root)).out).permission).toBe("deny");
    expect((await claude(root, "SessionStart", { source: "startup" })).out).toContain("SIGUIENTE:");

    await turn(root, false);
    expect(await writeApp(root)).toEqual(QUIET);
    expect(
      await claude(root, "PreToolUse", {
        tool_name: "Bash",
        tool_input: { command: "git commit --no-verify -m x" },
      }),
    ).toEqual(QUIET);
    expect(JSON.parse((await cursorWrite(root)).out).permission).toBe("allow");
    expect(await claude(root, "SessionStart", { source: "startup" })).toEqual(QUIET);
    expect(await claude(root, "SessionStart", { source: "compact" })).toEqual(QUIET);
  });

  it("AC2: takes no snapshot around a shell command and notes no step", async () => {
    const root = await tempRepo(APP);
    expect((await bash(root, "PreToolUse", "t1")).code).toBe(0);
    expect(await exists(gitPath(root, "specty/shell/t1.json"))).toBe(true);
    expect(await exists(gitPath(root, "common/specty/activity/claude-code-s1.json"))).toBe(true);

    await turn(root, false);
    expect(await bash(root, "PreToolUse", "t2", "s2")).toEqual(QUIET);
    expect(await exists(gitPath(root, "specty/shell/t2.json"))).toBe(false);
    await writeFiles(root, { "src/app.ts": "cambiado sin spec\n" });
    expect(await bash(root, "PostToolUse", "t2", "s2")).toEqual(QUIET);
    expect(await claude(root, "SessionEnd", { reason: "other" }, "s2")).toEqual(QUIET);
    expect(await exists(gitPath(root, "common/specty/activity/claude-code-s2.json"))).toBe(false);
  });

  it("AC2: keeps Claude Code's worktree hooks creating and removing folders", async () => {
    const root = await tempRepo(APP);
    await turn(root, false);
    const folder = join(root, ".claude", "worktrees", "explorar");
    const created = await claude(root, "WorktreeCreate", { name: "explorar" });
    expect(created).toMatchObject({ code: 0, out: folder });
    expect(git(folder, "branch", "--show-current")).toBe("worktree-explorar");
    expect((await claude(root, "WorktreeRemove", { worktree_path: folder })).code).toBe(0);
    expect(git(root, "worktree", "list", "--porcelain")).not.toContain(folder);
  });
});

describe("git's hooks and the end of turn with Specty off", () => {
  it("AC3: pre-commit lets through governed code it would block when on", async () => {
    const root = await tempRepo(APP);
    await writeFiles(root, { "src/app.ts": "sin spec\n" });
    git(root, "add", "src/app.ts");
    expect((await cli(root, ["hook", "pre-commit"])).code).toBe(1);
    await turn(root, false);
    expect(await cli(root, ["hook", "pre-commit"])).toEqual(QUIET);
  });

  it("AC3: a commit of governed code goes through the real hooks with no trailer, and Specty's own commits keep theirs", async () => {
    const root = await initialized();
    await turn(root, false);
    await writeFiles(root, { "src/app.ts": "sin spec\n" });
    git(root, "add", "src/app.ts");
    expect(tryGit(root, "commit", "-q", "-m", "fix: sin spec").status).toBe(0);
    expect(git(root, "log", "-1", "--format=%(trailers:key=Specty-Change,valueonly)")).toBe("");

    await cli(root, ["new", "Saludo personalizado"]);
    await writeFiles(root, { [SPEC_PATH]: SPEC });
    expect((await cli(root, ["propose"])).code).toBe(0);
    const approved = await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
    expect(approved.code).toBe(0);
    expect(git(root, "log", "-1", "--format=%(trailers:key=Specty-Change,valueonly)")).toBe(CHANGE);
  });

  it("AC3: the agent's end of turn lets it end without checking anything", async () => {
    const root = await tempRepo({
      ...APP,
      ".specty/config.yaml": `${CONFIG()}checks:\n  levels: { secrets: off }\n`,
    });
    await writeFiles(root, {
      "src/app.ts": `export const greet = () => 'hola';\n// ${TODO}: luego\n`,
    });
    const ending = "Hecho.\n\n**Qué queda pendiente**\n- Revisar el README.\n";
    const stop = (name: string, tool: string) =>
      cli(root, ["hook", name, tool], {
        stdin: JSON.stringify({
          hook_event_name: "Stop",
          session_id: "s1",
          stop_hook_active: false,
          last_assistant_message: ending,
        }),
      });
    expect(JSON.parse((await stop("agent-stop", "claude-code")).out).decision).toBe("block");
    expect(JSON.parse((await stop("memory-stop", "claude-code")).out).decision).toBe("block");

    await turn(root, false);
    for (const tool of ["claude-code", "codex"]) {
      expect(await stop("agent-stop", tool), tool).toEqual(QUIET);
      expect(await stop("memory-stop", tool), tool).toEqual(QUIET);
    }
    // Outside Specty, a tool that wants an answer every time gets the one that lets it end.
    const outside = await cli(join(root, ".."), ["hook", "agent-stop", "antigravity"], {
      stdin: "{}",
    });
    expect((await stop("agent-stop", "antigravity")).out).toBe(outside.out);
  });
});

describe("turning Specty back on", () => {
  it("AC6: the guard and pre-commit act again, and the open change stays in its phase", async () => {
    const root = await inReview();
    await turn(root, false);
    expect(await writeApp(root)).toEqual(QUIET);
    await turn(root, true);

    expect((await writeApp(root)).code).toBe(2);
    // Outside the change's scope: inside it, a manual edit goes through (ARCHITECTURE §9).
    await writeFiles(root, { "lib/fuera.ts": "sin spec\n" });
    git(root, "add", "lib/fuera.ts");
    expect((await cli(root, ["hook", "pre-commit"])).code).toBe(1);
    expect((await stateIn(root, CHANGE)).phase).toBe("review");
  });
});
