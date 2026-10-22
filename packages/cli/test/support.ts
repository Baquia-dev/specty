// SPDX-License-Identifier: Apache-2.0
import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
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

export function testEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const {
    CLAUDECODE: _a,
    CURSOR_AGENT: _b,
    GEMINI_CLI: _c,
    CODEX_SANDBOX: _d,
    SPECTY_AGENT: _e,
    ...rest
  } = process.env;
  return { ...rest, ...GIT_ENV, LANG: "es_ES.UTF-8", ...extra };
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

export const CONFIG = (verify = "true") =>
  `version: 1\nlanguage: es\nverify:\n  default: ${JSON.stringify(verify)}\n`;

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
