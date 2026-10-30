// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  CONFIG,
  cli,
  APP as FILES,
  git,
  inWorktree,
  person,
  stateIn,
  toAcceptance,
  tryGit,
  writeFiles,
} from "./support";

const ADJUSTMENT = "Cambia el saludo";

const merging = (folder: string) =>
  tryGit(folder, "rev-parse", "-q", "--verify", "MERGE_HEAD").status === 0;

/** A change in acceptance whose `accept` left main's merge in progress: the full verification fails. */
async function mergeLeft(): Promise<string> {
  const config = `${CONFIG()}  full: "echo roto && exit 1"\n`;
  const { root, folder } = await inWorktree({ ...FILES, ".specty/config.yaml": config });
  await toAcceptance(folder);
  await writeFiles(root, { "src/other.ts": "export const other = 1;\n" });
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "otro trabajo en main");
  expect((await cli(folder, ["accept"], { terminal: person() })).code).toBe(2);
  expect(merging(folder)).toBe(true);
  return folder;
}

describe("an incorporation whose merge someone aborted", () => {
  it("is forgotten by `next`, which no longer asks for `integrate`", async () => {
    const folder = await mergeLeft();
    git(folder, "merge", "--abort");
    const next = await cli(folder, ["next"]);
    expect(next.code).toBe(0);
    expect(next.out).not.toContain("integrate");
    const state = await stateIn(folder);
    expect(state).toMatchObject({ phase: "acceptance" });
    expect(state).not.toHaveProperty("integration");
  });

  it("is forgotten by `adjust`, which records the adjustment", async () => {
    const folder = await mergeLeft();
    git(folder, "merge", "--abort");
    const adjusted = await cli(folder, ["adjust", ADJUSTMENT]);
    expect(adjusted.code).toBe(0);
    expect(adjusted.out).not.toContain("integrate");
    const state = await stateIn(folder);
    expect(state).toMatchObject({
      phase: "adjusting",
      pending: { adjustment: { request: ADJUSTMENT } },
    });
    expect(state).not.toHaveProperty("integration");
  });
});

describe("an incorporation whose merge is still in progress", () => {
  it("stops `adjust`, which records nothing and leaves the merge to `integrate`", async () => {
    const folder = await mergeLeft();
    const adjusted = await cli(folder, ["adjust", ADJUSTMENT]);
    expect(adjusted.code).toBe(2);
    expect(adjusted.out).toContain(
      "El merge de main sigue en curso en esta carpeta: los ajustes se piden cuando termine.",
    );
    expect(adjusted.out).toContain(
      "SIGUIENTE: termina la incorporación con `specty integrate` (`specty next` te dice qué falta) y vuelve a ejecutar `specty adjust`.",
    );
    expect(merging(folder)).toBe(true);
    expect(await stateIn(folder)).toMatchObject({
      phase: "acceptance",
      integration: { target: "main", reason: "verify" },
      pending: { adjustment: null },
    });
  });

  it("is still shown by `next`", async () => {
    const folder = await mergeLeft();
    const next = await cli(folder, ["next"]);
    expect(next.out).toContain("Con main incorporado, la verificación falla");
    expect(next.out).toContain("`specty integrate`");
    expect(await stateIn(folder)).toHaveProperty("integration");
  });
});
