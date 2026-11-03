// SPDX-License-Identifier: Apache-2.0
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { exists, isRecord, parseJson, readText } from "../io/files";
import type { FormatterExclusion } from "./formatters";

/**
 * The changes' worktrees live in `.worktrees/`, inside the project (ADR 0018). A tool at the root
 * that runs or checks every file under it, and reads no `.gitignore`, would see their copies of
 * the project: Vitest and Jest run their tests, and the dev servers react to their files (Vite
 * reloads the page when a change's `tsconfig.json` changes; Metro sends the app an empty update for
 * each file). Each one's exclusion, as `doctor` asks for it.
 */
const PATH = ".worktrees/";

const VITEST = /^vitest\.config\.[cm]?[jt]s$/;
const VITE = /^vite\.config\.[cm]?[jt]s$/;
const JEST = /^jest\.config\.(?:[cm]?[jt]s|json)$/;
const ESLINT = /^eslint\.config\.[cm]?[jt]s$/;
const ESLINT_LEGACY = /^\.eslintrc(?:\.(?:js|cjs|json|ya?ml))?$/;
const METRO = /^metro\.config\.[cm]?[jt]s$/;

const VITEST_ADD = '"**/.worktrees/**"';
/**
 * Vite and Metro compare absolute paths: an unanchored pattern would also exclude their own files
 * when they run inside a worktree, so theirs is anchored to the config's folder. Neither puts that
 * path in a pattern as it is, where parentheses, brackets or Windows' backslashes would change its
 * meaning: Vite's compares the start of the path, which chokidar hands its functions with `/`; Metro
 * tests native paths, so its expression escapes the folder and takes either separator.
 */
const VITE_ADD = `(file) => file.startsWith(\`\${import.meta.dirname.replaceAll("\\\\", "/")}/.worktrees/\`)`;
const METRO_ADD = `new RegExp(\`^\${__dirname.replace(/[\\\\^$.*+?()[\\]{}|]/g, "\\\\$&")}[/\\\\\\\\]\\\\.worktrees[/\\\\\\\\]\`)`;
/** Characters that change a glob or a regular expression: a path with them can't go in one as it is. */
const SPECIAL = /[\\^$*+?()[\]{}|!]/;

/** Vitest, Vite, Jest, ESLint and Metro at the root, once a change lives in `.worktrees/`. */
export async function worktreeExclusions(root: string): Promise<FormatterExclusion[]> {
  if (!(await exists(join(root, PATH)))) return [];
  const entries = await readdir(root).catch(() => [] as string[]);
  const found = await viteConfigs(root, entries);
  const jest = await jestConfig(root, entries);
  if (jest !== undefined) found.push(jest);
  const eslint = await eslintConfig(root, entries);
  if (eslint !== undefined) found.push(eslint);
  const metro = await metroConfig(root, entries);
  if (metro !== undefined) found.push(metro);
  return found;
}

/**
 * Vitest in its own file or, without one, in Vite's when it has a `test` key; and Vite's watcher.
 * In a shared file, Vitest's line names the folder without `dirname`, and Vite's with it.
 */
async function viteConfigs(
  root: string,
  entries: readonly string[],
): Promise<FormatterExclusion[]> {
  const found: FormatterExclusion[] = [];
  const vitest = entries.find((entry) => VITEST.test(entry));
  const vite = entries.find((entry) => VITE.test(entry));
  const viteText = vite === undefined ? "" : ((await readText(join(root, vite))) ?? "");
  if (vitest !== undefined) {
    const text = (await readText(join(root, vitest))) ?? "";
    found.push(exclusion("Vitest", `${vitest} (test.exclude)`, VITEST_ADD, text));
  } else if (vite !== undefined && /\btest\s*:/.test(viteText)) {
    const excluded = namesFolder(viteText, false);
    found.push({
      name: "Vitest",
      path: PATH,
      file: `${vite} (test.exclude)`,
      add: VITEST_ADD,
      excluded,
    });
  }
  if (vite !== undefined) {
    found.push(
      anchored("Vite", `${vite} (server.watch.ignored)`, VITE_ADD, usable(viteText, root)),
    );
  }
  return found;
}

/** Metro's own file or, in a React Native app without one (Expo's default), the file to create. */
async function metroConfig(
  root: string,
  entries: readonly string[],
): Promise<FormatterExclusion | undefined> {
  const file = entries.find((entry) => METRO.test(entry));
  if (file !== undefined) {
    const text = (await readText(join(root, file))) ?? "";
    return anchored("Metro", `${file} (resolver.blockList)`, METRO_ADD, usable(text, root));
  }
  const manifest = parseJson((await readText(join(root, "package.json"))) ?? "");
  if (!isRecord(manifest)) return undefined;
  const native = [manifest.dependencies, manifest.devDependencies].some(
    (deps) => isRecord(deps) && "react-native" in deps,
  );
  return native
    ? anchored("Metro", "metro.config.js (resolver.blockList)", METRO_ADD, "")
    : undefined;
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

/** A dev server excludes the folder when a line names it next to the config's folder. */
function anchored(name: string, file: string, add: string, text: string): FormatterExclusion {
  return { name, path: PATH, file, add, excluded: namesFolder(text, true) };
}

/**
 * The config's lines that can exclude the folder of a project in `root`: one that puts the config's
 * folder in a pattern as it is (`${…dirname}/`) only matches when that path has no special characters.
 */
function usable(text: string, root: string): string {
  if (!SPECIAL.test(root)) return text;
  return text
    .split("\n")
    .filter((line) => !line.includes("dirname}/"))
    .join("\n");
}

/** Whether a line names `.worktrees`, with `dirname` on it or without. */
function namesFolder(text: string, withDirname: boolean): boolean {
  return text
    .split("\n")
    .some((line) => line.includes(".worktrees") && line.includes("dirname") === withDirname);
}
