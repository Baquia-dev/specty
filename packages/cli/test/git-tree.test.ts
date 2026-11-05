// SPDX-License-Identifier: Apache-2.0
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createGit } from "../src/io/git";
import { tempRepo, testEnv, writeFiles } from "./support";

/** Readings of the tree, each with the work of some paths. */
const READINGS = [["src/a.ts"], ["src/b.ts"], ["src/c.ts"], ["."]];

/** A repository with work in two committed files and in a new one. */
async function withWork() {
  const root = await tempRepo({
    "src/a.ts": "export const a = 1;\n",
    "src/b.ts": "export const b = 1;\n",
  });
  await writeFiles(root, {
    "src/a.ts": "export const a = 2;\n",
    "src/b.ts": "export const b = 2;\n",
    "src/c.ts": "export const c = 1;\n",
  });
  return { root, repo: createGit(root, testEnv()) };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a reading of the tree with the work of some paths", () => {
  it("AC2: two readings at once in the same process each give the tree of their content", async () => {
    const { repo } = await withWork();
    const alone: string[] = [];
    for (const paths of READINGS) alone.push(await repo.treeWith(paths));
    expect(new Set(alone).size).toBe(READINGS.length);
    // The same instant for all of them, as when they start in the same tick.
    vi.spyOn(Date, "now").mockReturnValue(Date.UTC(2026, 10, 5));
    const together = await Promise.all(READINGS.map((paths) => repo.treeWith(paths)));
    expect(together).toEqual(alone);
  });

  it("AC2: leaves no temporary index once the readings at once end", async () => {
    const { root, repo } = await withWork();
    vi.spyOn(Date, "now").mockReturnValue(Date.UTC(2026, 10, 5));
    await Promise.all(READINGS.map((paths) => repo.treeWith(paths)));
    const left = await readdir(join(root, ".git", "specty")).catch((): string[] => []);
    expect(left.filter((name) => name.startsWith("index-"))).toEqual([]);
  });
});
