// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, realpath, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";

/** Windows runs a script through a `.cmd` beside it, and not by its `#!` line. */
const WINDOWS = process.platform === "win32";

/** This machine's git: by `where` on Windows, which gives its `git.exe`, and `command -v` elsewhere. */
const GIT =
  (WINDOWS
    ? execFileSync("where", ["git"], { encoding: "utf8" })
    : execFileSync("sh", ["-c", "command -v git"], { encoding: "utf8" })
  )
    .split(/\r?\n/)[0]
    ?.trim() ?? "git";

/**
 * Writes `script`, a Node script with its `#!/usr/bin/env node` line, as the program `name` of
 * `folder`, as npm installs one: runnable as it is outside Windows, and on Windows by `name.cmd`,
 * which runs it with this Node and hands it its arguments with `%*`, as npm's shim does.
 */
export async function writeTool(folder: string, name: string, script: string): Promise<void> {
  await mkdir(folder, { recursive: true });
  await writeFile(join(folder, name), script, { mode: 0o755 });
  if (WINDOWS) {
    await writeFile(join(folder, `${name}.cmd`), `@"${process.execPath}" "%~dp0${name}" %*\r\n`);
  }
}

/** A test's folder of programs, `bin`, inside `folder`, and the PATH with only them, git and node. */
interface ToolFolder {
  readonly folder: string;
  readonly bin: string;
  readonly path: string;
}

/**
 * A new folder, named after `prefix`, with an empty `bin` for a test's programs, and a PATH with
 * only `bin`, git and node, so that no real tool of the machine runs. Outside Windows, git and
 * node are links in `bin`. On Windows the PATH also has git's own folder, since Git's launcher
 * finds the rest of Git beside it, and a tool's `.cmd` runs Node by its path.
 */
export async function toolFolder(prefix: string): Promise<ToolFolder> {
  const folder = await realpath(await mkdtemp(join(tmpdir(), prefix)));
  const bin = join(folder, "bin");
  await mkdir(bin);
  if (WINDOWS) return { folder, bin, path: [bin, dirname(GIT)].join(delimiter) };
  await symlink(GIT, join(bin, "git"));
  await symlink(process.execPath, join(bin, "node"));
  return { folder, bin, path: bin };
}
