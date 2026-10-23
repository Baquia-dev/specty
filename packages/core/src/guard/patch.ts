// SPDX-License-Identifier: Apache-2.0

/** The files a patch in the `*** Begin Patch` format (Codex, OpenCode) writes and deletes. */
export interface PatchPaths {
  readonly writes: readonly string[];
  readonly deletes: readonly string[];
}

// File contents start with `+`, `-`, a space or `@@`: a header never hides inside them.
const HEADER = /^\*\*\* (Add File|Update File|Delete File|Move to): (.+)$/;

/**
 * Reads a patch's headers: an added or updated file is written, a deleted one is removed, and
 * `*** Move to:` writes the new path and removes the one it updated. Paths are as the patch
 * names them, usually relative to the agent's folder.
 */
export function patchPaths(text: string): PatchPaths {
  const writes: string[] = [];
  const deletes: string[] = [];
  let updated: string | undefined;
  for (const line of text.split("\n")) {
    const [, header, raw] = HEADER.exec(line.trimEnd()) ?? [];
    const path = raw?.trim() ?? "";
    if (header === undefined || path === "") continue;
    if (header === "Move to" && updated !== undefined) {
      writes.splice(writes.lastIndexOf(updated), 1);
      deletes.push(updated);
    }
    if (header === "Delete File") deletes.push(path);
    else writes.push(path);
    updated = header === "Update File" ? path : undefined;
  }
  return { writes: [...new Set(writes)], deletes: [...new Set(deletes)] };
}
