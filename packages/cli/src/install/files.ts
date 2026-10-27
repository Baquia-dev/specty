// SPDX-License-Identifier: Apache-2.0
import { chmod, rm } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";
import { applyEdits, modify, parse } from "jsonc-parser";
import { isRecord, readText, writeText } from "../io/files";

/** A file an install created or changed, or would in a dry run. */
export interface FileChange {
  /** Absolute path. */
  readonly path: string;
  readonly created: boolean;
  /** It was deleted (`specty uninstall`). */
  readonly removed?: boolean;
}

/** How the installers read and write, so `init` can plan without writing and keep copies. */
export interface InstallFiles {
  read(path: string): Promise<string | undefined>;
  /** Writes `text` unless the file already holds it; `executable` also makes it runnable. */
  write(path: string, text: string, options?: { readonly executable?: boolean }): Promise<void>;
  /** Deletes the file, if there is one. */
  remove(path: string): Promise<void>;
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
  readonly removed?: boolean;
  /** Where its copy is, relative to the folder; created files have none. */
  readonly copy?: string;
}

export function installFiles(options: InstallFilesOptions = {}): InstallFiles {
  // What a dry run wrote, or `null` for what it deleted.
  const planned = new Map<string, string | null>();
  const changes: FileChange[] = [];
  const backups =
    options.backups === undefined || options.dryRun === true
      ? undefined
      : backupFolder(options.backups);
  const read = async (path: string) =>
    planned.has(path) ? (planned.get(path) ?? undefined) : await readText(path);

  async function record(path: string, before: string | undefined, removed = false): Promise<void> {
    const seen = changes.findIndex((change) => change.path === path);
    if (seen !== -1) {
      // Changed and then deleted in the same run: what counts is that it is gone.
      if (!removed) return;
      changes.splice(seen, 1, { ...(changes[seen] as FileChange), removed: true });
      return backups?.removed(path);
    }
    changes.push({ path, created: before === undefined, ...(removed ? { removed: true } : {}) });
    await backups?.add(path, before, removed);
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
    async remove(path) {
      const before = await read(path);
      if (before === undefined) return;
      await record(path, before, true);
      if (options.dryRun === true) planned.set(path, null);
      else await rm(path, { force: true });
    },
    changes,
  };
}

/** Where an install keeps what it changes: each existing file's copy and the manifest of all. */
interface BackupFolder {
  /** Records a change, copying the file first when it existed. */
  add(path: string, before: string | undefined, removed: boolean): Promise<void>;
  /** Marks a recorded change as deleted. */
  removed(path: string): Promise<void>;
}

function backupFolder(backups: NonNullable<InstallFilesOptions["backups"]>): BackupFolder {
  const manifest: ManifestEntry[] = [];
  let copied = false;
  /** Only files that existed make the folder worth having; created ones ride along. */
  const save = async (): Promise<void> => {
    if (!copied) return;
    const text = `${JSON.stringify(manifest, null, 2)}\n`;
    await writeText(join(backups.folder, "manifest.json"), text);
  };
  return {
    async add(path, before, removed) {
      const copy = before === undefined ? undefined : copyName(backups.root, path);
      if (copy !== undefined && before !== undefined) {
        await writeText(join(backups.folder, copy), before);
        copied = true;
      }
      manifest.push({
        path,
        created: before === undefined,
        ...(removed ? { removed: true } : {}),
        ...(copy !== undefined ? { copy } : {}),
      });
      await save();
    },
    async removed(path) {
      const entry = manifest.findIndex((item) => item.path === path);
      if (entry !== -1)
        manifest.splice(entry, 1, { ...(manifest[entry] as ManifestEntry), removed: true });
      await save();
    },
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

const FORMAT = { formattingOptions: { insertSpaces: true, tabSize: 2, eol: "\n" } };

/** Rewrites a JSON(C) file key by key, keeping comments and formatting elsewhere. */
export async function rewriteJson(
  path: string,
  update: (value: Record<string, unknown>) => Record<string, unknown>,
  create: boolean,
  files: InstallFiles,
): Promise<void> {
  const text = await files.read(path);
  if (text === undefined && !create) return;
  const source = text ?? "{}\n";
  const parsed: unknown = parse(source);
  const before = isRecord(parsed) ? parsed : {};
  const after = update(before);
  // A key the update left out is removed (`modify` with no value).
  const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
    (key) => JSON.stringify(after[key]) !== JSON.stringify(before[key]),
  );
  if (changed.length === 0 && text !== undefined) return;
  const final = changed.reduce(
    (current, key) => applyEdits(current, modify(current, [key], after[key], FORMAT)),
    source,
  );
  await files.write(path, final.endsWith("\n") ? final : `${final}\n`);
}
