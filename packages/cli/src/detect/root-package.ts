// SPDX-License-Identifier: Apache-2.0
import { readdir } from "node:fs/promises";
import { join } from "node:path";

/**
 * What a workspace root that is a package too reads of its own, as `paths` globs: every entry of
 * the repository outside the members' folders and the hidden ones, with `/**` on the folders. A
 * folder that holds members without being one, such as `crates/`, is walked: its other entries go,
 * not itself whole. It errs on the safe side: it may take in folders the package does not read,
 * such as `docs/`, never leave out one it does. Sorted.
 */
export async function rootPackagePaths(
  root: string,
  members: readonly string[],
): Promise<readonly string[]> {
  return (await entriesOutside(root, "", members)).toSorted();
}

/** The entries of `dir`, relative to `root`, outside `members` and the hidden ones. */
async function entriesOutside(
  root: string,
  dir: string,
  members: readonly string[],
): Promise<readonly string[]> {
  const entries = await readdir(join(root, dir), { withFileTypes: true }).catch(() => []);
  const found = await Promise.all(
    entries
      .filter((entry) => !entry.name.startsWith("."))
      .map(async (entry) => {
        const path = dir === "" ? entry.name : `${dir}/${entry.name}`;
        if (members.includes(path)) return [];
        if (!entry.isDirectory()) return [path];
        if (members.some((member) => member.startsWith(`${path}/`))) {
          return entriesOutside(root, path, members);
        }
        return [`${path}/**`];
      }),
  );
  return found.flat();
}
