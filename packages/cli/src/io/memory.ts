// SPDX-License-Identifier: Apache-2.0
import { execute } from "./exec";

/** The count of a line of `vm_stat`, as `Pages free:   259147.`. */
function pages(output: string, label: string): number | undefined {
  const found = new RegExp(`^${label}:\\s+(\\d+)\\.?\\s*$`, "m").exec(output);
  return found?.[1] === undefined ? undefined : Number(found[1]);
}

/**
 * The memory available, in bytes, that the output of macOS's `vm_stat` tells: its free, file-backed
 * and purgeable pages by the page size of its heading, the memory Activity Monitor does not count
 * as used. Undefined when it lacks one of those figures.
 */
export function vmStatMemory(output: string): number | undefined {
  const size = /\(page size of (\d+) bytes\)/.exec(output)?.[1];
  const counts = ["Pages free", "File-backed pages", "Pages purgeable"].map((label) =>
    pages(output, label),
  );
  const known = counts.filter((count) => count !== undefined);
  if (size === undefined || known.length < counts.length) return undefined;
  return known.reduce((sum, count) => sum + count, 0) * Number(size);
}

/**
 * The memory available on this machine, in bytes, as a verification's command starts. On macOS,
 * what `vm_stat` tells (`vmStatMemory`), run in `cwd` with `env`; anywhere else, or when `vm_stat`
 * fails or lacks those figures, `process.availableMemory()`: Linux's `MemAvailable`, within the
 * limit of its cgroup. On macOS that one also counts the inactive pages, which a machine in swap
 * has to compress or write to disk before using.
 */
export async function availableMemory(
  cwd: string,
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform = process.platform,
): Promise<number> {
  if (platform === "darwin") {
    const ran = await execute("vm_stat", [], { cwd, env });
    const read = ran.code === 0 ? vmStatMemory(ran.stdout) : undefined;
    if (read !== undefined) return read;
  }
  return process.availableMemory();
}
