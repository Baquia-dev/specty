// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import {
  configLine,
  configTemplate,
  flowBlock,
  flowLine,
  type GitFlow,
  humanSections,
  type Lang,
  languageLine,
  projectBlock,
  removeBlock,
  upsertBlock,
} from "@baquia-dev/specty-core";
import { isMap, isNode, isScalar, parseDocument, type YAMLMap } from "yaml";
import type { Detection } from "../detect/project";
import { projectFacts, verifyCommands } from "../detect/project";
import { COMMAND } from "../session";
import { type InstallFiles, installFiles } from "./files";

/**
 * Adds to an existing `.specty/config.yaml` the verification the detection finds and the file
 * lacks (`verify.default`, `verify.full`). It inserts lines into the text, so everything already
 * there, comments and formatting included, stays exactly as it was.
 */
export function completeConfig(
  text: string,
  detection: Detection,
): { readonly text: string; readonly added: readonly string[] } {
  const document = parseDocument(text);
  const current = document.get("verify", true);
  // Only a `verify` map, or none: anything else is the person's to fix, and validation says so.
  if (current !== undefined && !isMap(current)) return { text, added: [] };
  const detected = verifyCommands(detection.commands);
  const missing = (["default", "full"] as const).flatMap((key) => {
    const value = detected[key];
    return value === undefined || document.hasIn(["verify", key]) ? [] : [{ key, value }];
  });
  const added = missing.map(({ key, value }) => `verify.${key} (\`${value}\`)`);
  if (missing.length === 0) return { text, added };
  const entries = missing.map(({ key, value }) => `${key}: ${JSON.stringify(value)}`);
  if (current === undefined) return { text: withBlock(text, "verify", entries), added };
  return { text: intoMap(text, current, entries), added };
}

/** A new map `key` with `entries` at the end of the text. */
function withBlock(text: string, key: string, entries: readonly string[]): string {
  const separator = text === "" || text.endsWith("\n") ? "" : "\n";
  const block = entries.map((entry) => `  ${entry}`).join("\n");
  return `${text}${separator}${key}:\n${block}\n`;
}

/** The entries after the map's last value, with the indentation of its first key. */
function intoMap(text: string, map: YAMLMap, entries: readonly string[]): string {
  const at = map.range?.[1] ?? text.length;
  const first = map.items[0]?.key;
  const start = isNode(first) ? (first.range?.[0] ?? at) : at;
  const indent = " ".repeat(Math.max(start - (text.lastIndexOf("\n", start - 1) + 1), 2));
  const inserted = entries.map((entry) => `\n${indent}${entry}`).join("");
  const cut = text.slice(0, at).endsWith("\n") ? at - 1 : at;
  return `${text.slice(0, cut)}${inserted}${text.slice(cut)}`;
}

/**
 * Sets `language` in an existing `.specty/config.yaml`: it replaces only the value, or adds the
 * key after `version`, so comments and formatting stay. Unchanged when it already says `lang`.
 */
export function withLanguage(text: string, lang: Lang): string {
  const node = parseDocument(text).get("language", true);
  if (isScalar(node)) {
    if (node.value === lang || node.range === undefined || node.range === null) return text;
    const [start, end] = node.range;
    return `${text.slice(0, start)}${lang}${text.slice(end)}`;
  }
  const version = /^version:.*\n/m.exec(text);
  const at = version === null ? 0 : version.index + version[0].length;
  return `${text.slice(0, at)}language: ${lang}\n${text.slice(at)}`;
}

/**
 * Sets `git.flow` in `.specty/config.yaml` and, with Git Flow, `git.target: develop` when there is
 * no target yet: it replaces only the value or inserts the keys, so comments and formatting stay.
 * A `git` that is not a map is the person's to fix, and validation says so.
 */
export function withGitFlow(text: string, flow: GitFlow): string {
  const node = parseDocument(text).getIn(["git", "flow"], true);
  const replaced =
    isScalar(node) && node.range
      ? `${text.slice(0, node.range[0])}${flow}${text.slice(node.range[1])}`
      : text;
  const document = parseDocument(replaced);
  const git = document.get("git", true);
  if (git !== undefined && !isMap(git)) return text;
  const entries = [
    ...(document.hasIn(["git", "flow"]) ? [] : [`flow: ${flow}`]),
    ...(flow === "gitflow" && !document.hasIn(["git", "target"]) ? ["target: develop"] : []),
  ];
  if (entries.length === 0) return replaced;
  return git === undefined ? withBlock(replaced, "git", entries) : intoMap(replaced, git, entries);
}

/**
 * Writes `.specty/config.yaml`: a new one, or the existing one with the verification it lacks,
 * the language `--language` asks for and the flow `--git-flow` asks for. Returns the lines that
 * say what it did.
 */
export async function writeConfig(
  files: InstallFiles,
  path: string,
  detection: Detection,
  options: {
    readonly created: boolean;
    readonly lang: Lang;
    readonly relanguage?: Lang;
    readonly flow?: GitFlow;
  },
): Promise<readonly string[]> {
  const { lang, flow } = options;
  const flowed = (text: string) => (flow === undefined ? text : withGitFlow(text, flow));
  const flowLines = flow === undefined ? [] : [flowLine(flow, lang)];
  if (options.created) {
    const verify = verifyCommands(detection.commands);
    const template = configTemplate({ lang, verify, generated: detection.generated });
    await files.write(path, flowed(template));
    return [configLine(true, [], lang), ...flowLines];
  }
  // An existing configuration only gains the verification it lacks and the detection now finds.
  const current = (await files.read(path)) ?? "";
  const completed = completeConfig(current, detection);
  const relanguaged =
    options.relanguage === undefined
      ? completed.text
      : withLanguage(completed.text, options.relanguage);
  const text = flowed(relanguaged);
  if (text !== current) await files.write(path, text);
  const changed = [
    ...(relanguaged !== completed.text ? [languageLine(lang)] : []),
    ...(text !== relanguaged ? flowLines : []),
  ];
  if (changed.length === 0) return [configLine(false, completed.added, lang)];
  const added = completed.added.length > 0 ? [configLine(false, completed.added, lang)] : [];
  return [...changed, ...added];
}

/** Writes or refreshes the managed blocks of AGENTS.md; the rest of the file is the user's. */
export async function writeAgentsMd(
  root: string,
  lang: Lang,
  detection: Detection,
  files: InstallFiles = installFiles(),
): Promise<"created" | "updated"> {
  const path = join(root, "AGENTS.md");
  const current = await files.read(path);
  const base = current ?? `# ${detection.name}\n\n${humanSections(lang)}\n`;
  const withProject = upsertBlock(base, "project", projectBlock(projectFacts(detection), lang));
  await files.write(path, upsertBlock(withProject, "flow", flowBlock(lang, COMMAND)));
  return current === undefined ? "created" : "updated";
}

/** Takes Specty's blocks out of AGENTS.md; the rest of the file is the person's and stays. */
export async function removeAgentsBlocks(root: string, files: InstallFiles): Promise<void> {
  const path = join(root, "AGENTS.md");
  const current = await files.read(path);
  if (current === undefined) return;
  const left = removeBlock(removeBlock(current, "flow"), "project");
  if (left === current) return;
  if (left.trim() === "") await files.remove(path);
  else await files.write(path, left);
}

/** How GEMINI.md imports AGENTS.md: Gemini CLI documents only paths that start with `./`. */
export const GEMINI_POINTER = "@./AGENTS.md";

/** Claude Code reads CLAUDE.md: it imports AGENTS.md instead of copying it. */
export function writeClaudePointer(
  root: string,
  files: InstallFiles = installFiles(),
): Promise<boolean> {
  return writePointer(root, "CLAUDE.md", "@AGENTS.md", files);
}

/**
 * An agent's own instructions file starts with `line`, which imports AGENTS.md, and keeps what it
 * had; false when it already imports it.
 */
export async function writePointer(
  root: string,
  file: string,
  line: string,
  files: InstallFiles = installFiles(),
): Promise<boolean> {
  const path = join(root, file);
  const current = await files.read(path);
  if (current?.split("\n").some((text) => text.trim() === line) === true) return false;
  await files.write(path, current === undefined ? `${line}\n` : `${line}\n\n${current}`);
  return true;
}
