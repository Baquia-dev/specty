// SPDX-License-Identifier: Apache-2.0
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isRecord } from "../src/io/files";
import {
  CHANGE,
  CONFIG,
  cli,
  DIST,
  folderOf,
  git,
  person,
  read,
  tempRepo,
  testEnv,
  tryGit,
  writeFiles,
} from "./support";

/**
 * Antigravity's CLI (`agy`), only when `SPECTY_E2E_ANTIGRAVITY` gives its path: it talks to a real
 * model, which costs usage, so it never runs from the PATH. Undefined: the tests skip.
 */
const AGY = process.env.SPECTY_E2E_ANTIGRAVITY || undefined;
const MODEL = "gemini-3.8-flash-low";
const LONG = { timeout: 360_000 };
// Put together from parts, so that this file does not trip `specty check`.
const TODO = "TODO";
const GREET = "export const greet = () => 'hola';\n";
const OTHER = CHANGE.replace("saludo-personalizado", "otro-cambio");
const OTHER_SPEC = `.specty/changes/${OTHER}/spec.md`;

/** A repository with Specty's guard and end of turn in `.agents/hooks.json`, calling `DIST`. */
async function initialized(): Promise<string> {
  const root = await tempRepo({
    "src/app.ts": GREET,
    "package.json": '{"name":"demo","scripts":{"test":"true"}}\n',
  });
  expect((await cli(root, ["init", "--language", "es", "--tools", "antigravity"])).code).toBe(0);
  await writeFiles(root, {
    ".specty/config.yaml": `${CONFIG()}checks:\n  levels: { secrets: off }\n`,
  });
  git(root, "add", "-A");
  expect(tryGit(root, "commit", "-q", "-m", "chore: specty").status).toBe(0);
  expect((await cli(root, ["check", "--install"], { terminal: person() })).code).toBe(0);
  return root;
}

/**
 * `agy -p` in `root` with `prompt`, and the events of its `stream-json`. Its sandbox hides what is
 * outside the workspace, so the bundle's folder is mounted read-only, and in print mode it denies
 * what would ask for permission, so the commands inside the sandbox go on without asking. These
 * settings are for this session only: agy does not save them.
 */
async function agy(root: string, prompt: string): Promise<readonly Record<string, unknown>[]> {
  const settings = {
    toolPermission: "proceed-in-sandbox",
    trustedWorkspaces: [root],
    permissions: { allow: [`read_file(${dirname(DIST)})`] },
  };
  const args = [
    ...["-p", prompt, "--model", MODEL, "--mode", "accept-edits", "--sandbox"],
    ...["--output-format", "stream-json", "--print-timeout", "4m"],
    ...["--settings", JSON.stringify(settings)],
  ];
  const out = await new Promise<string>((done) => {
    const options = { cwd: root, env: testEnv(), timeout: 300_000, maxBuffer: 64 * 1024 * 1024 };
    execFile(AGY ?? "agy", args, options, (_, stdout) => done(stdout));
  });
  return out
    .split("\n")
    .filter((line) => line.startsWith("{"))
    .map((line): Record<string, unknown> => JSON.parse(line));
}

/** The conversation of `agy -p` and the one of its first subagent, from its `stream-json`. */
function conversations(events: readonly Record<string, unknown>[]) {
  let main: string | undefined;
  let subagent: string | undefined;
  for (const event of events) {
    if (event.event === "init" && typeof event.conversation_id === "string") {
      main = event.conversation_id;
    }
    const step = isRecord(event.step_update) ? event.step_update : {};
    const info = isRecord(step.subagent_info) ? step.subagent_info : {};
    const first: unknown = Array.isArray(info.subagents) ? info.subagents[0] : undefined;
    if (subagent === undefined && isRecord(first) && typeof first.conversation_id === "string") {
      subagent = first.conversation_id;
    }
  }
  return { main, subagent };
}

/** The folder the guard bound `conversation` to, if any. */
async function boundOf(root: string, conversation = ""): Promise<string | undefined> {
  const path = `.git/common/specty/sessions/${conversation}.json`;
  return existsSync(join(root, path)) ? JSON.parse(await read(root, path)).folder : undefined;
}

describe.skipIf(AGY === undefined)(
  "Antigravity with a real model (needs agy in SPECTY_E2E_ANTIGRAVITY and a built bundle)",
  () => {
    it(
      "AC4: a subagent of invoke_subagent enters its slice's folder, and the main conversation stays in its own",
      LONG,
      async () => {
        const root = await initialized();
        expect((await cli(root, ["new", "--worktree", "Saludo personalizado"])).code).toBe(0);
        const slice = ["new", "--worktree", "--subagent", "Otro cambio"];
        expect((await cli(root, slice)).code).toBe(0);
        const [first, second] = [folderOf(root), folderOf(root, OTHER)];
        // `specty check --changed` fails in the slice's folder: its end of turn is not sent back.
        await writeFiles(second, { "src/app.ts": `${GREET}// ${TODO}: later\n` });
        const enter = (id: string) => `node "${DIST}" enter ${id}`;
        const brief = [
          "Do exactly this and nothing else:",
          `(a) run this shell command with run_command, exactly as written: ${enter(OTHER)}`,
          `(b) create the file ${join(second, OTHER_SPEC)} with the content '# Plan del corte' using your file writing tool;`,
          "(c) reply to your parent with send_message: DONE.",
        ].join(" ");
        const prompt = [
          "Follow these steps exactly, in order, and do nothing else:",
          `1. Run this shell command with run_command, exactly as written: ${enter(CHANGE)}`,
          `2. Call invoke_subagent once, with Workspace "inherit", Role "Slice worker", TypeName "self" and this Prompt: ${JSON.stringify(brief)}`,
          "3. Wait for the subagent's message, then answer FINISHED.",
        ].join("\n");
        const { main, subagent } = conversations(await agy(root, prompt));
        expect(main).toBeDefined();
        expect(subagent).toBeDefined();
        expect(subagent).not.toBe(main);
        expect(await boundOf(root, subagent)).toBe(second);
        expect(await boundOf(root, main)).toBe(first);
        expect(await read(second, OTHER_SPEC)).toMatch(/^# Plan del corte\s*$/);
        expect(existsSync(join(root, OTHER_SPEC))).toBe(false);
        const pending = resolve(second, git(second, "rev-parse", "--git-path", "specty/pending"));
        expect(existsSync(join(pending, `${subagent}.stop`))).toBe(false);
        expect(await read(second, "src/app.ts")).toContain(`// ${TODO}: later`);
      },
    );
  },
);
