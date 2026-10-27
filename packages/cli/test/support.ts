// SPDX-License-Identifier: Apache-2.0
import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { expect } from "vitest";
import { runCli } from "../src/program";
import type { Terminal } from "../src/session";

export const DIST = join(import.meta.dirname, "..", "dist", "specty.mjs");
/**
 * The commands' clock: today at 10:00 UTC. The git hooks run on the real clock, so a fixed date
 * would let a receipt written by `approve` expire (24 h) and break the hook tests one day later.
 */
export const NOW = new Date(`${new Date().toISOString().slice(0, 10)}T10:00:00Z`);
/** Where `close` archives a change today. */
export const ARCHIVE = `.specty/archive/${NOW.getUTCFullYear()}`;

/** Isolated git: no global or system configuration, fixed identity. */
const GIT_ENV = {
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "Ana",
  GIT_AUTHOR_EMAIL: "ana@example.com",
  GIT_COMMITTER_NAME: "Ana",
  GIT_COMMITTER_EMAIL: "ana@example.com",
};

/** Codex's user configuration for the tests, so `init` never touches the real `~/.codex`. */
export const CODEX_HOME = join(tmpdir(), `specty-codex-${process.pid}`);
/** Where OpenCode's global configuration goes in the tests, instead of `~/.config`. */
const XDG_CONFIG_HOME = join(tmpdir(), `specty-config-${process.pid}`);

export function testEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const {
    CLAUDECODE: _a,
    CURSOR_AGENT: _b,
    GEMINI_CLI: _c,
    CODEX_SANDBOX: _d,
    CODEX_CI: _g,
    CODEX_THREAD_ID: _h,
    SPECTY_AGENT: _e,
    OPENCODE: _f,
    // Antigravity CLI's mark, with both editors turned off.
    HGEDITOR: _k,
    JJ_EDITOR: _l,
    // The tests choose their language with LANG, which these would override (macOS runners set
    // LC_ALL).
    LC_ALL: _i,
    LC_MESSAGES: _j,
    ...rest
  } = process.env;
  return { ...rest, ...GIT_ENV, LANG: "es_ES.UTF-8", CODEX_HOME, XDG_CONFIG_HOME, ...extra };
}

export function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, env: testEnv(), encoding: "utf8" }).trim();
}

/** Runs git and returns its status and output instead of throwing (for blocked commits). */
export function tryGit(cwd: string, ...args: string[]): { status: number; output: string } {
  const result = spawnSync("git", args, { cwd, env: testEnv(), encoding: "utf8" });
  return { status: result.status ?? -1, output: `${result.stdout}${result.stderr}` };
}

export async function writeFiles(
  root: string,
  files: Readonly<Record<string, string>>,
): Promise<void> {
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content);
  }
}

export async function read(root: string, path: string): Promise<string> {
  return readFile(join(root, path), "utf8");
}

/** A repository with one commit containing `files`. */
export async function tempRepo(files: Readonly<Record<string, string>>): Promise<string> {
  const root = await realpath(await mkdtemp(join(tmpdir(), "specty-")));
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.name", "Ana");
  git(root, "config", "user.email", "ana@example.com");
  await writeFiles(root, files);
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "init");
  return root;
}

export interface Answers {
  readonly confirm?: readonly boolean[];
  readonly choose?: readonly string[];
  readonly ask?: readonly string[];
}

/** A person at a TTY who gives the scripted answers (confirm defaults to yes). */
export function person(answers: Answers = {}): Terminal & { readonly notes: string[] } {
  const confirms = [...(answers.confirm ?? [])];
  const choices = [...(answers.choose ?? [])];
  const texts = [...(answers.ask ?? [])];
  const notes: string[] = [];
  return {
    interactive: true,
    notes,
    confirm: async () => confirms.shift() ?? true,
    choose: async (_message, options) => {
      const wanted = choices.shift();
      return options.find((option) => option.value === wanted)?.value ?? options[0]?.value;
    },
    ask: async () => texts.shift(),
    note: (title, body) => {
      notes.push(`${title}\n${body}`);
    },
  };
}

/** An agent's shell: never interactive, never asked. */
export const AGENT: Terminal = {
  interactive: false,
  confirm: () => Promise.reject(new Error("an agent cannot be asked")),
  choose: () => Promise.reject(new Error("an agent cannot be asked")),
  ask: () => Promise.reject(new Error("an agent cannot be asked")),
  note: () => undefined,
};

export interface Run {
  readonly code: number;
  readonly out: string;
  readonly err: string;
}

export async function cli(
  cwd: string,
  argv: readonly string[],
  options: { terminal?: Terminal; stdin?: string; env?: Record<string, string> } = {},
): Promise<Run> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runCli(argv, {
    cwd,
    env: testEnv(options.env),
    now: () => NOW,
    terminal: options.terminal ?? AGENT,
    io: { out: (text) => out.push(text), err: (text) => err.push(text) },
    invocation: { command: `node "${DIST}"`, portable: false, script: DIST },
    stdin: async () => options.stdin ?? "",
  });
  return { code, out: out.join("\n"), err: err.join("\n") };
}

/**
 * A test repository's configuration. Changes stay in the same folder, as most tests follow one
 * folder's flow; `git` goes before `verify` so tests can append keys to `verify`.
 */
export const CONFIG = (verify = "true") =>
  `version: 1\nlanguage: es\ngit:\n  worktrees: false\nverify:\n  default: ${JSON.stringify(verify)}\n`;

export const SPEC = `---
kind: standard
---

# Saludo personalizado

## Objetivo

La app saluda por nombre.

## Fuera de alcance

- Traducciones.

## Supuestos

- A1: El nombre llega como argumento.
  - impacto: alto
- A2: Sin nombre se usa «mundo».

## Criterios de aceptación

- AC1: CUANDO se pasa «Ana» ENTONCES imprime «Hola, Ana».

## Archivos

- modificar src/app.ts — saludo
- crear src/app.test.ts — prueba

## Tareas

- [ ] T1: Saludar por nombre
  - files: src/app.ts, src/app.test.ts
  - ac: AC1
- [ ] T2: Mensaje por defecto
  - files: src/app.ts
  - ac: AC1
  - type: refactor
`;

export const CHANGE = `${NOW.toISOString().slice(0, 10).replaceAll("-", "")}-saludo-personalizado`;
export const SPEC_PATH = `.specty/changes/${CHANGE}/spec.md`;

/** The files of a repository for SPEC's change. */
export const APP = {
  "src/app.ts": "export const greet = () => 'hola';\n",
  ".specty/config.yaml": CONFIG(),
};

/** Where `new --worktree` puts the change `id` of `root`. */
export const folderOf = (root: string, id = CHANGE) =>
  join(dirname(root), `${basename(root)}.worktrees`, id);

/** A repository whose change lives in a worktree of its own. */
export async function inWorktree(files: Readonly<Record<string, string>> = APP) {
  const root = await tempRepo(files);
  expect((await cli(root, ["new", "--worktree", "Saludo personalizado"])).code).toBe(0);
  return { root, folder: folderOf(root) };
}

/** Takes SPEC's change in `folder` to a closing that waits for the person. */
export async function toClosing(folder: string): Promise<void> {
  await writeFiles(folder, { [SPEC_PATH]: SPEC });
  expect((await cli(folder, ["propose"])).code).toBe(0);
  const approved = await cli(folder, ["approve"], { terminal: person({ choose: ["confirm"] }) });
  expect(approved.code).toBe(0);
  await cli(folder, ["next"]);
  await writeFiles(folder, { "src/app.ts": "1\n" });
  await cli(folder, ["task", "done", "T1", "--summary", "Uno"]);
  await writeFiles(folder, { "src/app.ts": "2\n" });
  await cli(folder, ["task", "done", "T2", "--summary", "Dos"]);
  await cli(folder, ["accept"], { terminal: person() });
  const closing = "\n## Cierre\n\n### Resumen\n\nSaludo listo.\n";
  await writeFiles(folder, { [SPEC_PATH]: `${await read(folder, SPEC_PATH)}${closing}` });
  expect((await cli(folder, ["propose"])).out).toContain("Cierre válido.");
}

/** The test a fix of the button brings. */
export const BUTTON_TEST = "it('says Sign in', () => {});\n";

/** A quick change of `root`, in its own worktree, that writes `text` to the button: in acceptance. */
export async function quickInWorktree(root: string, title: string, slug: string, text: string) {
  expect((await cli(root, ["new", "--worktree", "--kind", "quick", title])).code).toBe(0);
  const id = `${CHANGE.slice(0, 8)}-${slug}`;
  const folder = folderOf(root, id);
  await writeFiles(folder, {
    [`.specty/changes/${id}/spec.md`]: `---\nkind: quick\n---\n\n# ${title}\n\n## Objetivo\n\nDice «Sing in».\n\n## Archivos\n\n- modificar src/button.ts — texto\n\n## Tareas\n\n- [ ] T1: Corregir texto\n  - files: src/button.ts\n  - type: fix\n`,
  });
  await cli(folder, ["propose"]);
  await cli(folder, ["approve"], { terminal: person() });
  await cli(folder, ["next"]);
  // A fix brings its test, one of its own: `task done` runs `specty check --spec`.
  const test = `it('says ${text.trim()}', () => {});\n`;
  await writeFiles(folder, { "src/button.ts": text, "src/button.test.ts": test });
  await cli(folder, ["task", "done", "T1", "--summary", "Texto corregido"]);
  return { id, folder };
}

/** The change's `state.json` in `folder`. */
export async function stateIn(folder: string, id = CHANGE): Promise<Record<string, unknown>> {
  return JSON.parse(await read(folder, `.specty/changes/${id}/state.json`));
}
