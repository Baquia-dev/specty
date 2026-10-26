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
  readonly name: "Biome" | "Prettier";
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
];

const PRETTIER_CONFIG = /^(?:\.prettierrc(?:\.[\w]+)?|prettier\.config\.[cm]?[jt]s)$/;

export async function formatterExclusions(root: string): Promise<FormatterExclusion[]> {
  const written: Written[] = [];
  for (const entry of WRITTEN) {
    if (!entry.optional || (await exists(join(root, entry.path)))) written.push(entry);
  }
  const found: FormatterExclusion[] = [];
  const biome = await firstText(root, ["biome.json", "biome.jsonc"]);
  if (biome !== undefined) {
    for (const entry of written) {
      found.push({
        name: "Biome",
        path: entry.path,
        file: `${biome.file} (files.includes)`,
        add: entry.biome,
        excluded: entry.inBiome.test(biome.text),
      });
    }
  }
  if (await usesPrettier(root)) {
    const lines = ((await readText(join(root, ".prettierignore"))) ?? "")
      .split("\n")
      .map((line) => line.trim());
    for (const entry of written) {
      found.push({
        name: "Prettier",
        path: entry.path,
        file: ".prettierignore",
        add: entry.prettier,
        excluded: lines.some((line) => entry.inPrettier.test(line)),
      });
    }
  }
  return found;
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
