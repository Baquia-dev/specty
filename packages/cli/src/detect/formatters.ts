// SPDX-License-Identifier: Apache-2.0
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { isRecord, parseJson, readText } from "../io/files";

/**
 * A formatter that would also check `.specty/`. Specty writes its state in its own format, so
 * the repository should exclude that folder rather than have Specty imitate every formatter.
 */
export interface FormatterExclusion {
  readonly name: "Biome" | "Prettier";
  /** Where the exclusion goes. */
  readonly file: string;
  /** What to add there. */
  readonly add: string;
  readonly excluded: boolean;
}

const PRETTIER_CONFIG = /^(?:\.prettierrc(?:\.[\w]+)?|prettier\.config\.[cm]?[jt]s)$/;

export async function formatterExclusions(root: string): Promise<FormatterExclusion[]> {
  const found: FormatterExclusion[] = [];
  const biome = await firstText(root, ["biome.json", "biome.jsonc"]);
  if (biome !== undefined) {
    found.push({
      name: "Biome",
      file: `${biome.file} (files.includes)`,
      add: '"!.specty"',
      excluded: /"!(?:\*\*\/)?\.specty(?:\/\*\*)?\/?"/.test(biome.text),
    });
  }
  if (await usesPrettier(root)) {
    const ignore = (await readText(join(root, ".prettierignore"))) ?? "";
    found.push({
      name: "Prettier",
      file: ".prettierignore",
      add: ".specty/",
      excluded: ignore.split("\n").some((line) => /^\/?\.specty\/?(?:\*\*)?$/.test(line.trim())),
    });
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
