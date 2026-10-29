// SPDX-License-Identifier: Apache-2.0
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { isRecord, readText } from "../io/files";
import type { Commands } from "./project";

/**
 * The commands the project's CI runs, for what its stack does not give (ARCHITECTURE §17).
 * GitHub Actions, GitLab CI, CircleCI, Bitbucket Pipelines and Azure Pipelines put them under
 * `run`, `script` or `command`; each one counts by generic words, without knowing each tool.
 */

type CiCommands = Pick<Commands, "test" | "lint" | "typecheck">;
type Category = keyof CiCommands;

const WORKFLOWS = ".github/workflows";
const CI_FILES = [
  ".gitlab-ci.yml",
  ".circleci/config.yml",
  "bitbucket-pipelines.yml",
  "azure-pipelines.yml",
];
const COMMAND_KEYS: ReadonlySet<string> = new Set(["run", "script", "command"]);
/** Words of a command that prepares the environment rather than checking the code. */
const SETUP: ReadonlySet<string> = new Set(["install", "add", "uses"]);

export async function ciCommands(root: string): Promise<CiCommands> {
  const files = [...(await workflows(root)), ...CI_FILES].sort();
  const texts = await Promise.all(files.map((path) => readText(join(root, path))));
  const commands = texts.flatMap((text) => commandTexts(safeYaml(text)).flatMap(commandsOf));
  const pick = (category: Category) => {
    const command = commands.find((candidate) => categoryOf(candidate) === category);
    return command === undefined ? {} : { [category]: command };
  };
  return { ...pick("test"), ...pick("lint"), ...pick("typecheck") };
}

async function workflows(root: string): Promise<string[]> {
  const names = await readdir(join(root, WORKFLOWS)).catch(() => []);
  return names.filter((name) => /\.ya?ml$/.test(name)).map((name) => `${WORKFLOWS}/${name}`);
}

/** The strings under `run`, `script` or `command`, at any depth, in the YAML's order. */
function commandTexts(node: unknown, key?: string): string[] {
  if (typeof node === "string") return key !== undefined && COMMAND_KEYS.has(key) ? [node] : [];
  if (Array.isArray(node)) return node.flatMap((item) => commandTexts(item, key));
  if (!isRecord(node)) return [];
  return Object.entries(node).flatMap(([name, value]) => commandTexts(value, name));
}

/** Each command of a text: one per line, and one per side of `&&` or `;`. */
function commandsOf(text: string): string[] {
  return text
    .split("\n")
    .flatMap((line) => line.split(/&&|;/))
    .map((command) => command.trim())
    .filter((command) => command.length > 0);
}

/**
 * What a command checks, or nothing when it cannot run the same way here, only prepares, or hides
 * its exit code behind a pipe (`make test || true`, `make test | tee test.log`).
 */
function categoryOf(command: string): Category | undefined {
  if (command.startsWith("#") || command.endsWith("\\") || /[$|]/.test(command)) return undefined;
  const words = command
    .toLowerCase()
    .split(/\s+/)
    .flatMap((word) => word.split(":"));
  if (words.some((word) => SETUP.has(word))) return undefined;
  return words.map(wordCategory).find((category) => category !== undefined);
}

function wordCategory(word: string): Category | undefined {
  // `latest` is an image or package tag, not a test runner.
  if (word === "tests" || (word.endsWith("test") && word !== "latest")) return "test";
  if (word === "lint" || word === "analyze" || word === "analyse") return "lint";
  if (word === "typecheck" || word === "type-check") return "typecheck";
  return undefined;
}

function safeYaml(text: string | undefined): unknown {
  if (text === undefined) return undefined;
  try {
    return parseYaml(text);
  } catch {
    return undefined;
  }
}
