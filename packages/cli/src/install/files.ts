// SPDX-License-Identifier: Apache-2.0
import { chmod } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";
import { readText, writeText } from "../io/files";

/** A file an install created or changed, or would in a dry run. */
export interface FileChange {
  /** Absolute path. */
  readonly path: string;
  readonly created: boolean;
}

/** How the installers read and write, so `init` can plan without writing and keep copies. */
export interface InstallFiles {
  read(path: string): Promise<string | undefined>;
  /** Writes `text` unless the file already holds it; `executable` also makes it runnable. */
  write(path: string, text: string, options?: { readonly executable?: boolean }): Promise<void>;
  /** What changed so far, each file once, in order. */
  readonly changes: readonly FileChange[];
}

export interface InstallFilesOptions {
  /** Plan only: nothing touches the disk, and later reads see what was planned. */
  readonly dryRun?: boolean;
  /**
   * Before an existing file changes for the first time, its copy goes to `folder`: `repo/<path>`
   * inside `root`, `outside/<absolute path>` elsewhere, with a `manifest.json` of every change.
   */
  readonly backups?: { readonly folder: string; readonly root: string };
}

interface ManifestEntry {
  readonly path: string;
  readonly created: boolean;
  /** Where its copy is, relative to the folder; created files have none. */
  readonly copy?: string;
}

export function installFiles(options: InstallFilesOptions = {}): InstallFiles {
  const planned = new Map<string, string>();
  const changes: FileChange[] = [];
  const manifest: ManifestEntry[] = [];
  let copied = false;
  const read = async (path: string) => planned.get(path) ?? (await readText(path));

  async function record(path: string, before: string | undefined): Promise<void> {
    if (changes.some((change) => change.path === path)) return;
    changes.push({ path, created: before === undefined });
    const { backups } = options;
    if (backups === undefined || options.dryRun === true) return;
    const copy = before === undefined ? undefined : copyName(backups.root, path);
    if (copy !== undefined && before !== undefined) {
      await writeText(join(backups.folder, copy), before);
      copied = true;
    }
    manifest.push({ path, created: before === undefined, ...(copy !== undefined ? { copy } : {}) });
    // Only files that existed make the folder worth having; created ones ride along.
    if (copied) {
      await writeText(
        join(backups.folder, "manifest.json"),
        `${JSON.stringify(manifest, null, 2)}\n`,
      );
    }
  }

  return {
    read,
    async write(path, text, writeOptions = {}) {
      const before = await read(path);
      if (before !== text) await record(path, before);
      if (options.dryRun === true) {
        planned.set(path, text);
        return;
      }
      if (before !== text) await writeText(path, text);
      if (writeOptions.executable === true) await chmod(path, 0o755);
    },
    changes,
  };
}

function copyName(root: string, path: string): string {
  const inner = relative(root, path);
  if (inner !== "" && !inner.startsWith("..") && !isAbsolute(inner)) {
    return ["repo", ...inner.split(sep)].join("/");
  }
  return [
    "outside",
    ...path
      .replace(/^[A-Za-z]:/, "")
      .split(sep)
      .filter(Boolean),
  ].join("/");
}
