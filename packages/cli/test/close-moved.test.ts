// SPDX-License-Identifier: Apache-2.0
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
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
import { COMMON_DIR } from "./tools";

const BRANCH = `specty/${CHANGE}`;

/**
 * A full verification that, while `.git/arm` holds a number above zero, lowers it and commits a
 * file to main in the main folder, as another session landing meanwhile would.
 */
const MOVER = `
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const common = path.resolve(${COMMON_DIR});
const root = path.dirname(common);
const arm = path.join(common, "arm");
const left = fs.existsSync(arm) ? Number(fs.readFileSync(arm, "utf8")) : 0;
if (left > 0) {
  fs.writeFileSync(arm, String(left - 1));
  fs.writeFileSync(path.join(root, "src", "moved-" + left + ".ts"), "export const moved = 1;\\n");
  execFileSync("git", ["-C", root, "add", "-A"]);
  execFileSync("git", ["-C", root, "commit", "-q", "--no-verify", "-m", "otra sesión integra"]);
}
`;

/**
 * A change ready to close whose full verification moves main `times` times once armed, with
 * `internal.retries.landing` set to `retries` when given.
 */
async function closingWhileMainMoves(times: number, retries?: number) {
  const script = join(await mkdtemp(join(tmpdir(), "specty-mover-")), "mover.js");
  await writeFile(script, MOVER);
  const full = `node "${script}"`;
  const { root, folder } = await inWorktree({
    ...FILES,
    ".specty/config.yaml": `${CONFIG()}  full: ${JSON.stringify(full)}\n${
      retries === undefined ? "" : `internal:\n  retries:\n    landing: ${retries}\n`
    }`,
  });
  await toClosing(folder);
  // Main moves on before the closing, so that it incorporates main and verifies it.
  await writeFiles(root, { "src/other.ts": "export const other = 1;\n" });
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "otro trabajo en main");
  // Armed only now: accepting ran the same verification.
  await writeFile(join(root, ".git", "arm"), String(times));
  return { root, folder };
}

describe("closing while main moves", () => {
  it("AC1: incorporates main again, verifies it and lands, with no need to close again", async () => {
    const { root } = await closingWhileMainMoves(1);
    const closed = await cli(root, ["close", CHANGE], { terminal: person() });
    expect(closed.code).toBe(0);
    expect(closed.out).toContain("Incorporado a main.");
    expect(closed.out).not.toContain("main no avanzó");
    expect(git(root, "rev-parse", "main")).toBe(git(root, "rev-parse", BRANCH));
    expect(await exists(join(root, "src", "moved-1.ts"))).toBe(true);
    expect(await read(root, "src/app.ts")).toBe("2\n");
    expect(await read(root, ".git/arm")).toBe("0");
  });

  it("AC2: tries three times at most while main keeps moving, then says so", async () => {
    const { root } = await closingWhileMainMoves(10);
    const closed = await cli(root, ["close", CHANGE], { terminal: person() });
    expect(closed.out).toContain("main no avanzó");
    expect(closed.out).toContain("vuelve a ejecutar `specty close` para incorporarlo");
    expect(await read(root, ".git/arm")).toBe("7");
  });

  it("AC3: with `internal.retries.landing`, tries that many more times at most while main keeps moving, then says so", async () => {
    const { root } = await closingWhileMainMoves(10, 1);
    const closed = await cli(root, ["close", CHANGE], { terminal: person() });
    expect(closed.out).toContain("main no avanzó");
    expect(closed.out).toContain("vuelve a ejecutar `specty close` para incorporarlo");
    expect(await read(root, ".git/arm")).toBe("8");
  });

  it("AC3: with `internal.retries.landing: 0`, does not incorporate main again when it moved, and says so", async () => {
    const { root } = await closingWhileMainMoves(1, 0);
    const closed = await cli(root, ["close", CHANGE], { terminal: person() });
    expect(closed.out).toContain("main no avanzó");
    expect(closed.out).toContain("vuelve a ejecutar `specty close` para incorporarlo");
    expect(await read(root, ".git/arm")).toBe("0");
    expect(git(root, "rev-parse", "main")).not.toBe(git(root, "rev-parse", BRANCH));
  });
});
