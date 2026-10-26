// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import {
  flowBlock,
  humanSections,
  type Lang,
  projectBlock,
  removeBlock,
  upsertBlock,
} from "@baquia-dev/specty-core";
import { isMap, isNode, isScalar, parseDocument } from "yaml";
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
  if (current === undefined) {
    const separator = text === "" || text.endsWith("\n") ? "" : "\n";
    const block = entries.map((entry) => `  ${entry}`).join("\n");
    return { text: `${text}${separator}verify:\n${block}\n`, added };
  }
  // After the map's last value, with the indentation of its first key.
  const at = current.range?.[1] ?? text.length;
  const first = current.items[0]?.key;
  const start = isNode(first) ? (first.range?.[0] ?? at) : at;
  const indent = " ".repeat(Math.max(start - (text.lastIndexOf("\n", start - 1) + 1), 2));
  const inserted = entries.map((entry) => `\n${indent}${entry}`).join("");
  const cut = text.slice(0, at).endsWith("\n") ? at - 1 : at;
  return { text: `${text.slice(0, cut)}${inserted}${text.slice(cut)}`, added };
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
