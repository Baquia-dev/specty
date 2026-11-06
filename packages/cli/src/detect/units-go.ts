// SPDX-License-Identifier: Apache-2.0
import { join, posix } from "node:path";
import type { WorkspacePackage } from "@baquia-dev/specty-core";
import { exists, readText } from "../io/files";
import { rootPackagePaths } from "./root-package";
import type { WorkspaceFacts } from "./workspace-units";

/** The root files every module's tests read. */
const SHARED = ["go.work", "go.work.sum"];

/**
 * A `go.work` workspace: the modules of its `use` directives with a `go.mod`, each tested with
 * `go test ./<folder>/...`, and the root files they share. The root's module (`use .`) is tested
 * with `go test ./...`, which skips the folders with a `go.mod` of their own, and reads the root
 * outside the other modules' folders (`rootPackagePaths`). Undefined without `go.work` and with
 * fewer than two modules.
 */
export async function goWorkspace(root: string): Promise<WorkspaceFacts | undefined> {
  const work = await readText(join(root, "go.work"));
  if (work === undefined) return undefined;
  const dirs = directives(work, "use").flatMap(([path]) => {
    const dir = path === undefined ? undefined : folderOf(path);
    return dir === undefined ? [] : [dir];
  });
  const read = await Promise.all([...new Set(dirs)].map((dir) => moduleOf(root, dir)));
  const listed = read.flatMap((module) => (module === undefined ? [] : [module]));
  const others = listed.filter((module) => module.dir !== ".").map((module) => module.dir);
  const modules = await Promise.all(
    listed.map(async (module) =>
      module.dir === "." ? { ...module, paths: await rootPackagePaths(root, others) } : module,
    ),
  );
  if (modules.length < 2) return undefined;
  const names = new Set(modules.map((module) => module.name));
  const packages = modules.map((module) => ({
    ...module,
    uses: module.uses.filter((name) => names.has(name)),
  }));
  const found = await Promise.all(SHARED.map((file) => exists(join(root, file))));
  return { packages, shared: SHARED.filter((_, at) => found[at] === true) };
}

/** What a module's `go.mod` says: its path, as its name, and the modules it requires. */
async function moduleOf(root: string, dir: string): Promise<WorkspacePackage | undefined> {
  const text = await readText(join(root, dir, "go.mod"));
  if (text === undefined) return undefined;
  const name = directives(text, "module")[0]?.[0];
  if (name === undefined) return undefined;
  const uses = directives(text, "require").flatMap(([path]) => (path === undefined ? [] : [path]));
  const command = dir === "." ? "go test ./..." : `go test ./${dir}/...`;
  return { dir, name, tests: true, command, uses };
}

/** A `use` path as a repository-relative folder; undefined when it leaves the repository. */
function folderOf(path: string): string | undefined {
  const dir = posix.normalize(path.replaceAll("\\", "/")).replace(/\/$/, "");
  const outside = dir === ".." || dir.startsWith("../") || /^(\/|[A-Za-z]:)/.test(dir);
  return outside ? undefined : dir;
}

/**
 * The arguments of each `verb` directive of a `go.mod` or `go.work`, one line each: the lines of
 * its `verb ( … )` blocks and its one-line `verb …` directives, without `//` comments.
 */
function directives(text: string, verb: string): readonly (readonly string[])[] {
  const found: (readonly string[])[] = [];
  let block = false;
  for (const line of text.split("\n")) {
    const words = tokens(line.replace(/\/\/.*$/, ""));
    if (block) {
      if (words[0] === ")") block = false;
      else if (words.length > 0) found.push(words);
    } else if (words[0] === verb) {
      if (words[1] === "(") block = words[2] !== ")";
      else found.push(words.slice(1));
    }
  }
  return found;
}

/** A directive line's words, with the quotes of `"…"` and `` `…` `` removed. */
function tokens(line: string): readonly string[] {
  return [...line.matchAll(/"[^"]*"|`[^`]*`|\S+/g)].map(([word]) =>
    /^["`]/.test(word) ? word.slice(1, -1) : word,
  );
}
