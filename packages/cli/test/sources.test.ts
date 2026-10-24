// SPDX-License-Identifier: Apache-2.0
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

/** The repository's check of sources: `pnpm sources`. */
const SCRIPT = join(import.meta.dirname, "..", "..", "..", "scripts", "check-sources.mjs");
const HEADER = "// SPDX-License-Identifier: Apache-2.0";

/** Runs the check in a folder with `files` under `packages/`. */
async function check(files: Readonly<Record<string, string>>) {
  const root = await mkdtemp(join(tmpdir(), "specty-sources-"));
  await mkdir(join(root, "scripts"), { recursive: true });
  for (const [path, text] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), text);
  }
  const run = spawnSync("node", [SCRIPT], { cwd: root, encoding: "utf8" });
  return { status: run.status, output: `${run.stdout}${run.stderr}` };
}

describe("pnpm sources", () => {
  it("wants the SPDX header in every source", async () => {
    const missing = await check({
      "packages/a/src/with.ts": `${HEADER}\nexport const a = 1;\n`,
      "packages/a/src/without.ts": "export const b = 1;\n",
    });
    expect(missing.status).toBe(1);
    expect(missing.output).toContain(`packages/a/src/without.ts: missing "${HEADER}"`);
    expect(missing.output).not.toContain("with.ts:");
  });

  it("leaves the size of the files to Specty", async () => {
    const long = `${HEADER}\n${"export const v = 1;\n".repeat(2_000)}`;
    const result = await check({ "packages/a/src/long.ts": long });
    expect(result.status).toBe(0);
    expect(result.output).toContain("Sources OK (1 files: SPDX header).");
  });
});
