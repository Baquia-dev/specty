// SPDX-License-Identifier: Apache-2.0
import { isAbsolute, join, resolve } from "node:path";
import { type Document, isMap, parseDocument } from "yaml";
import { exists, isDirectory, isRecord, parseJson, readText } from "../io/files";
import type { Git } from "../io/git";
import type { Invocation } from "../session";
import { type InstallFiles, installFiles } from "./files";

type HookManager = "native" | "husky" | "lefthook" | "simple-git-hooks";

const GIT_HOOKS = ["pre-commit", "prepare-commit-msg"] as const;
const LEFTHOOK_FILES = ["lefthook.yml", "lefthook.yaml", ".lefthook.yml", ".lefthook.yaml"];
const BEGIN = "# >>> specty >>>";
const END = "# <<< specty <<<";

export interface HookInstall {
  readonly manager: HookManager;
  /** Repository-relative or absolute paths written. */
  readonly files: readonly string[];
  /** Set when the hooks could not be installed automatically. */
  readonly manual?: string;
}

async function detectHookManager(root: string, git: Git): Promise<HookManager> {
  const hooksPath = await git.config("core.hooksPath");
  if (hooksPath?.includes(".husky") === true || (await isDirectory(join(root, ".husky"))))
    return "husky";
  for (const file of LEFTHOOK_FILES) {
    if (await exists(join(root, file))) return "lefthook";
  }
  const pkg = parseJson(await readText(join(root, "package.json")));
  if (isRecord(pkg) && pkg["simple-git-hooks"] !== undefined) return "simple-git-hooks";
  return "native";
}

/** Installs `pre-commit` and `prepare-commit-msg` through the repository's hook manager. */
export async function installGitHooks(
  root: string,
  git: Git,
  invocation: Invocation,
  files: InstallFiles = installFiles(),
): Promise<HookInstall> {
  const manager = await detectHookManager(root, git);
  switch (manager) {
    case "husky":
      return {
        manager,
        files: await writeScripts(join(root, ".husky"), portable(invocation), false, files),
      };
    case "lefthook":
      return { manager, files: [await writeLefthook(root, portable(invocation), files)] };
    case "simple-git-hooks":
      return {
        manager,
        files: [],
        manual: `"pre-commit": "${portable(invocation).command} hook pre-commit", "prepare-commit-msg": "${portable(invocation).command} hook prepare-commit-msg"`,
      };
    case "native":
      return {
        manager,
        files: await writeScripts(await hooksDirectory(root, git), invocation, true, files),
      };
  }
}

async function hooksDirectory(root: string, git: Git): Promise<string> {
  const configured = await git.config("core.hooksPath");
  if (configured !== undefined)
    return isAbsolute(configured) ? configured : resolve(root, configured);
  return git.gitPath("hooks");
}

/** True when every Specty hook block is present for the detected manager. */
export async function gitHooksInstalled(root: string, git: Git): Promise<boolean> {
  const manager = await detectHookManager(root, git);
  if (manager === "lefthook") {
    const texts = await Promise.all(LEFTHOOK_FILES.map((file) => readText(join(root, file))));
    return texts.some(
      (text) =>
        text?.includes("hook pre-commit") === true && text.includes("hook prepare-commit-msg"),
    );
  }
  if (manager === "simple-git-hooks") return false;
  const directory = manager === "husky" ? join(root, ".husky") : await hooksDirectory(root, git);
  const texts = await Promise.all(GIT_HOOKS.map((hook) => readText(join(directory, hook))));
  return texts.every((text) => text?.includes(BEGIN) === true);
}

/** Takes Specty's blocks out of the git hooks; a hook left with nothing else goes. */
export async function removeGitHooks(root: string, git: Git, files: InstallFiles): Promise<void> {
  const manager = await detectHookManager(root, git);
  if (manager === "lefthook") return removeLefthook(root, files);
  if (manager === "simple-git-hooks") return;
  const directory = manager === "husky" ? join(root, ".husky") : await hooksDirectory(root, git);
  for (const hook of GIT_HOOKS) {
    const path = join(directory, hook);
    const text = await files.read(path);
    if (text === undefined || !text.includes(BEGIN)) continue;
    const left = removeShellBlock(text);
    if (left.replace(/^#!.*\n?/, "").trim() === "") await files.remove(path);
    else await files.write(path, left, { executable: true });
  }
}

/** The text without Specty's block and the line break `upsertShellBlock` put after it. */
function removeShellBlock(text: string): string {
  const start = text.indexOf(BEGIN);
  const stop = text.indexOf(END);
  if (start === -1 || stop < start) return text;
  return `${text.slice(0, start)}${text.slice(stop + END.length).replace(/^\n/, "")}`;
}

async function removeLefthook(root: string, files: InstallFiles): Promise<void> {
  for (const file of LEFTHOOK_FILES) {
    const path = join(root, file);
    const text = await files.read(path);
    if (text === undefined) continue;
    const document = parseDocument(text);
    if (!removedSpectyCommands(document)) continue;
    const rest = document.contents;
    if (rest === null || (isMap(rest) && rest.items.length === 0)) await files.remove(path);
    else await files.write(path, document.toString());
  }
}

/** Deletes Specty's command from each hook of a Lefthook file, and what it leaves empty; whether there was one. */
function removedSpectyCommands(document: Document): boolean {
  const ours = GIT_HOOKS.filter((hook) => document.hasIn([hook, "commands", "specty"]));
  for (const hook of ours) {
    document.deleteIn([hook, "commands", "specty"]);
    for (const key of [[hook, "commands"], [hook]]) {
      const node = document.getIn(key, true);
      if (isMap(node) && node.items.length === 0) document.deleteIn(key);
    }
  }
  return ours.length > 0;
}

/** Committed hook files cannot hold machine paths: they call `specty` from PATH. */
function portable(invocation: Invocation): Invocation {
  return invocation.portable ? invocation : { command: "specty", portable: true };
}

async function writeScripts(
  directory: string,
  invocation: Invocation,
  shebang: boolean,
  files: InstallFiles,
): Promise<string[]> {
  const written: string[] = [];
  for (const hook of GIT_HOOKS) {
    const path = join(directory, hook);
    const current = (await files.read(path)) ?? (shebang ? "#!/bin/sh\n" : "");
    const text = upsertShellBlock(current, block(hook, invocation));
    await files.write(path, text, { executable: true });
    written.push(path);
  }
  return written;
}

function block(hook: (typeof GIT_HOOKS)[number], invocation: Invocation): string {
  const run = `${invocation.command} hook ${hook} "$@" || exit $?`;
  const available =
    invocation.script === undefined
      ? `command -v ${invocation.command.split(" ")[0] ?? "specty"} >/dev/null 2>&1`
      : `[ -f "${invocation.script}" ]`;
  return [
    BEGIN,
    "# Gestionado por Specty / managed by Specty: no edites este bloque.",
    `if ${available}; then`,
    `  ${run}`,
    "else",
    `  echo "specty: no está instalado; el commit no se verificó (npm i -g @baquia-dev/specty)." >&2`,
    "fi",
    END,
  ].join("\n");
}

export function upsertShellBlock(text: string, content: string): string {
  const start = text.indexOf(BEGIN);
  const stop = text.indexOf(END);
  if (start !== -1 && stop > start)
    return `${text.slice(0, start)}${content}${text.slice(stop + END.length)}`;
  const separator = text.length === 0 || text.endsWith("\n") ? "" : "\n";
  return `${text}${separator}${content}\n`;
}

async function writeLefthook(
  root: string,
  invocation: Invocation,
  files: InstallFiles,
): Promise<string> {
  const candidates = await Promise.all(
    LEFTHOOK_FILES.map(async (file) => ((await exists(join(root, file))) ? file : undefined)),
  );
  const file = candidates.find((candidate) => candidate !== undefined) ?? "lefthook.yml";
  const path = join(root, file);
  const document = parseDocument((await files.read(path)) ?? "");
  document.setIn(
    ["pre-commit", "commands", "specty", "run"],
    `${invocation.command} hook pre-commit`,
  );
  document.setIn(
    ["prepare-commit-msg", "commands", "specty", "run"],
    `${invocation.command} hook prepare-commit-msg {1} {2} {3}`,
  );
  await files.write(path, document.toString());
  return file;
}
