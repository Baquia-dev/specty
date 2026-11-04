// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { exists } from "../src/io/files";
import {
  CHANGE,
  CONFIG,
  cli,
  APP as FILES,
  git,
  inWorktree,
  person,
  read,
  toClosing,
  writeFiles,
} from "./support";

const BRANCH = `specty/${CHANGE}`;

/** A command that leaves, in the folder it runs in, a mark with that folder. */
const MARK = `node -e "require('fs').writeFileSync('landed.txt', process.cwd())"`;
const BREAKS = `node -e "console.log('rompe'); process.exit(3)"`;

/** A change ready to close, in a worktree of its own, with `afterLanding` as `git.afterLanding`. */
async function closingWith(afterLanding?: string) {
  const config =
    afterLanding === undefined
      ? CONFIG()
      : CONFIG().replace("git:\n", `git:\n  afterLanding: ${JSON.stringify(afterLanding)}\n`);
  const { root, folder } = await inWorktree({ ...FILES, ".specty/config.yaml": config });
  await toClosing(folder);
  return { root, folder };
}

describe("the command after a change is merged into main", () => {
  it("AC1: runs in the folder that holds main once it moved, and the closing says it passed", async () => {
    const { root, folder } = await closingWith(MARK);
    const closed = await cli(folder, ["close"], { terminal: person() });
    expect(closed.code).toBe(0);
    expect(closed.out).toContain("Incorporado a main.");
    expect(closed.out).toContain(`Tras incorporarlo, \`${MARK}\` pasó en `);
    expect(await exists(join(root, "landed.txt"))).toBe(true);
    expect(await read(root, "src/app.ts")).toBe("2\n");
  });

  it("AC2: leaves the change closed and merged when it fails, and says so with its last line", async () => {
    const { root, folder } = await closingWith(BREAKS);
    const closed = await cli(folder, ["close"], { terminal: person() });
    expect(closed.out).toContain("Incorporado a main.");
    expect(closed.out).toContain(`Tras incorporarlo, \`${BREAKS}\` falló en `);
    expect(closed.out).toContain("(rompe); el cambio ya está incorporado");
    expect(git(root, "rev-parse", "main")).toBe(git(root, "rev-parse", BRANCH));
  });

  it("AC3: runs nothing without git.afterLanding, nor when main did not move", async () => {
    const plain = await closingWith();
    const closed = await cli(plain.folder, ["close"], { terminal: person() });
    expect(closed.out).toContain("Incorporado a main.");
    expect(closed.out).not.toContain("Tras incorporarlo");

    const { root, folder } = await closingWith(MARK);
    await writeFiles(root, { "src/app.ts": "a medias\n" });
    const refused = await cli(folder, ["close"], { terminal: person() });
    expect(refused.out).not.toContain("Incorporado a main.");
    expect(refused.out).not.toContain("Tras incorporarlo");
    expect(await exists(join(root, "landed.txt"))).toBe(false);
  });
});
