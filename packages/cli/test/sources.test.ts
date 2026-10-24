// SPDX-License-Identifier: Apache-2.0
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

/** The repository's check of sources: `pnpm sources`. */
const SCRIPT = join(import.meta.dirname, "..", "..", "..", "scripts", "check-sources.mjs");
const HEADER = "// SPDX-License-Identifier: Apache-2.0";

/** A source with the header and `count` lines of code. */
const code = (count: number, extra = ""): string =>
  `${HEADER}\n${Array.from({ length: count }, (_, index) => `export const v${index} = ${index};`).join("\n")}\n${extra}`;

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
  it("warns past 300 lines of code and fails past 500", async () => {
    const warned = await check({ "packages/a/src/long.ts": code(320) });
    expect(warned.status).toBe(0);
    expect(warned.output).toContain(
      "packages/a/src/long.ts: 320 lines of code (warning past 300, error past 500). If it mixes responsibilities, propose how to split it; never split it just to meet the number.",
    );
    const failed = await check({ "packages/a/src/huge.ts": code(510) });
    expect(failed.status).toBe(1);
    expect(failed.output).toContain(
      "packages/a/src/huge.ts: 510 lines of code (max 500); split it by responsibility.",
    );
  });

  it("counts code only: neither blank lines nor comments", async () => {
    const comments = `/**\n${" * Documentation.\n".repeat(80)} */\n${"\n".repeat(60)}// A note.\n`;
    const result = await check({ "packages/a/src/documented.ts": code(290, comments) });
    expect(result.status).toBe(0);
    expect(result.output).not.toContain("lines of code (");
  });

  it("gives tests more room", async () => {
    const result = await check({
      "packages/a/test/long.test.ts": code(450),
      "packages/a/src/b.test.ts": code(380),
      "packages/a/test/huge.test.ts": code(610),
    });
    expect(result.status).toBe(1);
    expect(result.output).toContain(
      "packages/a/test/long.test.ts: 450 lines of code (warning past 400, error past 600).",
    );
    expect(result.output).not.toContain("b.test.ts");
    expect(result.output).toContain("packages/a/test/huge.test.ts: 610 lines of code (max 600)");
  });

  it("does not size what is generated or is data, but still wants its header", async () => {
    const result = await check({
      "packages/a/src/model.g.ts": code(900),
      "packages/a/src/sample-records.ts": code(900),
      "packages/a/src/spec/messages.es.ts": code(900),
      "packages/a/src/i18n/en.ts": code(900),
      "packages/a/src/db/migrations/0001.ts": code(900),
      "packages/a/src/__mocks__/api.ts": code(900),
      "packages/a/src/plain.ts": "export const x = 1;\n",
    });
    expect(result.status).toBe(1);
    expect(result.output).not.toContain("lines of code (");
    expect(result.output).toContain(`packages/a/src/plain.ts: missing "${HEADER}"`);
  });
});
