// SPDX-License-Identifier: Apache-2.0
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { exists, isRecord, parseJson, readText } from "../io/files";
import type { FormatterExclusion } from "./formatters";

/**
 * The changes' worktrees live in `.worktrees/`, inside the project (ADR 0018). A tool at the root
 * that runs or checks every file under it, and reads no `.gitignore`, would see their copies of
 * the project: Vitest and Jest run their tests. Each one's exclusion, as `doctor` asks for it.
 */
const PATH = ".worktrees/";

const VITEST = /^vitest\.config\.[cm]?[jt]s$/;
const JEST = /^jest\.config\.(?:[cm]?[jt]s|json)$/;
const ESLINT = /^eslint\.config\.[cm]?[jt]s$/;
const ESLINT_LEGACY = /^\.eslintrc(?:\.(?:js|cjs|json|ya?ml))?$/;

/** Vitest, Jest and ESLint at the root, once a change lives in `.worktrees/`. */
export async function worktreeExclusions(root: string): Promise<FormatterExclusion[]> {
  if (!(await exists(join(root, PATH)))) return [];
  const entries = await readdir(root).catch(() => [] as string[]);
  const found: FormatterExclusion[] = [];
  const vitest = entries.find((entry) => VITEST.test(entry));
  if (vitest !== undefined) {
    const text = (await readText(join(root, vitest))) ?? "";
    found.push(exclusion("Vitest", `${vitest} (test.exclude)`, '"**/.worktrees/**"', text));
  }
  const jest = await jestConfig(root, entries);
  if (jest !== undefined) found.push(jest);
  const eslint = await eslintConfig(root, entries);
  if (eslint !== undefined) found.push(eslint);
  return found;
}

/** Jest's own file, or its settings in `package.json`. */
async function jestConfig(
  root: string,
  entries: readonly string[],
): Promise<FormatterExclusion | undefined> {
  const file = entries.find((entry) => JEST.test(entry));
  const keys = "testPathIgnorePatterns, modulePathIgnorePatterns";
  const add = '"<rootDir>/.worktrees/"';
  if (file !== undefined) {
    const text = (await readText(join(root, file))) ?? "";
    return exclusion("Jest", `${file} (${keys})`, add, text);
  }
  const manifest = parseJson((await readText(join(root, "package.json"))) ?? "");
  if (!isRecord(manifest) || manifest.jest === undefined) return undefined;
  const where = "package.json (jest.testPathIgnorePatterns, jest.modulePathIgnorePatterns)";
  return exclusion("Jest", where, add, JSON.stringify(manifest.jest));
}

/** ESLint's flat configuration, or the older one, which reads `.eslintignore`. */
async function eslintConfig(
  root: string,
  entries: readonly string[],
): Promise<FormatterExclusion | undefined> {
  const flat = entries.find((entry) => ESLINT.test(entry));
  if (flat !== undefined) {
    const text = (await readText(join(root, flat))) ?? "";
    return exclusion("ESLint", `${flat} (ignores)`, '".worktrees/"', text);
  }
  if (!entries.some((entry) => ESLINT_LEGACY.test(entry))) return undefined;
  const ignore = (await readText(join(root, ".eslintignore"))) ?? "";
  return exclusion("ESLint", ".eslintignore", PATH, ignore);
}

/** A tool excludes the folder when its settings name it. */
function exclusion(name: string, file: string, add: string, text: string): FormatterExclusion {
  return { name, path: PATH, file, add, excluded: text.includes(".worktrees") };
}
