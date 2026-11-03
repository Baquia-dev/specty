// SPDX-License-Identifier: Apache-2.0
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { exists, isRecord, parseJson, readText } from "../io/files";

/**
 * A formatter that would also check a path Specty writes in its own format: `.specty/`, and the
 * agent hook files of `init`. The repository should exclude them rather than have Specty imitate
 * every formatter.
 */
export interface FormatterExclusion {
  /** The tool: Biome and Prettier here, and the JavaScript ones of `worktree-tools.ts`. */
  readonly name: string;
  /** The path Specty writes. */
  readonly path: string;
  /** Where the exclusion goes. */
  readonly file: string;
  /** What to add there. */
  readonly add: string;
  readonly excluded: boolean;
}

interface Written {
  readonly path: string;
  /** Checked only when it exists: the agent hook files depend on the tools installed. */
  readonly optional: boolean;
  readonly biome: string;
  readonly inBiome: RegExp;
  readonly prettier: string;
  readonly inPrettier: RegExp;
  /** Also excluded when `.gitignore` ignores it: Prettier reads it, and Biome with `useIgnoreFile`. */
  readonly gitignored?: RegExp;
}

/** What Specty writes, and how each formatter's exclusion of it (or of its folder) looks. */
const WRITTEN: readonly Written[] = [
  {
    path: ".specty/",
    optional: false,
    biome: '"!.specty"',
    inBiome: /"!(?:\*\*\/)?\.specty(?:\/\*\*)?\/?"/,
    prettier: ".specty/",
    inPrettier: /^\/?\.specty\/?(?:\*\*)?$/,
  },
  {
    path: ".claude/settings.json",
    optional: true,
    biome: '"!.claude/settings.json"',
    inBiome: /"!(?:\*\*\/)?\.claude(?:\/settings\.json|\/\*\*|\/)?"/,
    prettier: ".claude/settings.json",
    inPrettier: /^\/?\.claude(?:\/settings\.json|\/\*\*|\/)?$/,
  },
  {
    path: ".cursor/hooks.json",
    optional: true,
    biome: '"!.cursor/hooks.json"',
    inBiome: /"!(?:\*\*\/)?\.cursor(?:\/hooks\.json|\/\*\*|\/)?"/,
    prettier: ".cursor/hooks.json",
    inPrettier: /^\/?\.cursor(?:\/hooks\.json|\/\*\*|\/)?$/,
  },
  {
    path: ".codex/hooks.json",
    optional: true,
    biome: '"!.codex/hooks.json"',
    inBiome: /"!(?:\*\*\/)?\.codex(?:\/hooks\.json|\/\*\*|\/)?"/,
    prettier: ".codex/hooks.json",
    inPrettier: /^\/?\.codex(?:\/hooks\.json|\/\*\*|\/)?$/,
  },
  {
    path: ".opencode/plugins/specty.js",
    optional: true,
    biome: '"!.opencode/plugins/specty.js"',
    inBiome: /"!(?:\*\*\/)?\.opencode(?:\/plugins(?:\/specty\.js|\/\*\*|\/)?|\/\*\*|\/)?"/,
    prettier: ".opencode/plugins/specty.js",
    inPrettier: /^\/?\.opencode(?:\/plugins(?:\/specty\.js|\/\*\*|\/)?|\/\*\*|\/)?$/,
  },
  // The changes' worktrees, inside the project once `new` made one (ADR 0018).
  {
    path: ".worktrees/",
    optional: true,
    biome: '"!.worktrees"',
    inBiome: /"!(?:\*\*\/)?\.worktrees(?:\/\*\*)?\/?"/,
    prettier: ".worktrees/",
    inPrettier: /^\/?\.worktrees\/?(?:\*\*)?$/,
    gitignored: /^\/?\.worktrees\/?$/,
  },
];

const PRETTIER_CONFIG = /^(?:\.prettierrc(?:\.[\w]+)?|prettier\.config\.[cm]?[jt]s)$/;

export async function formatterExclusions(root: string): Promise<FormatterExclusion[]> {
  const written: Written[] = [];
  for (const entry of WRITTEN) {
    if (!entry.optional || (await exists(join(root, entry.path)))) written.push(entry);
  }
  const ignored = await linesOf(root, ".gitignore");
  const byGit = (entry: Written) =>
    entry.gitignored !== undefined && ignored.some((line) => entry.gitignored?.test(line));
  return [
    ...(await biomeExclusions(root, written, byGit)),
    ...(await prettierExclusions(root, written, byGit)),
  ];
}

/** Biome's exclusion of each path; with `vcs.useIgnoreFile` it also reads `.gitignore`. */
async function biomeExclusions(
  root: string,
  written: readonly Written[],
  byGit: (entry: Written) => boolean,
): Promise<FormatterExclusion[]> {
  const biome = await firstText(root, ["biome.json", "biome.jsonc"]);
  if (biome === undefined) return [];
  const readsGit = /"useIgnoreFile"\s*:\s*true/.test(biome.text);
  return written.map((entry) => ({
    name: "Biome",
    path: entry.path,
    file: `${biome.file} (files.includes)`,
    add: entry.biome,
    excluded: entry.inBiome.test(biome.text) || (readsGit && byGit(entry)),
  }));
}

/** Prettier's exclusion of each path, in `.prettierignore` or, as it reads it too, `.gitignore`. */
async function prettierExclusions(
  root: string,
  written: readonly Written[],
  byGit: (entry: Written) => boolean,
): Promise<FormatterExclusion[]> {
  if (!(await usesPrettier(root))) return [];
  const lines = await linesOf(root, ".prettierignore");
  return written.map((entry) => ({
    name: "Prettier",
    path: entry.path,
    file: ".prettierignore",
    add: entry.prettier,
    excluded: lines.some((line) => entry.inPrettier.test(line)) || byGit(entry),
  }));
}

/** A file's lines, trimmed; none when it is missing. */
async function linesOf(root: string, file: string): Promise<string[]> {
  return ((await readText(join(root, file))) ?? "").split("\n").map((line) => line.trim());
}

async function firstText(
  root: string,
  files: readonly string[],
): Promise<{ file: string; text: string } | undefined> {
  for (const file of files) {
    const text = await readText(join(root, file));
    if (text !== undefined) return { file, text };
  }
  return undefined;
}

async function usesPrettier(root: string): Promise<boolean> {
  const entries = await readdir(root).catch(() => [] as string[]);
  if (entries.some((entry) => PRETTIER_CONFIG.test(entry))) return true;
  const manifest = parseJson((await readText(join(root, "package.json"))) ?? "");
  return isRecord(manifest) && manifest.prettier !== undefined;
}
