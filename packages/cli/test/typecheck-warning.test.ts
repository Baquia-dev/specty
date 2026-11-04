// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { APP, CONFIG, cli, SPEC, SPEC_PATH, tempRepo, writeFiles } from "./support";

/** A JavaScript project whose type check is its `typecheck` script: `npm run typecheck`. */
const PACKAGE = `${JSON.stringify({
  name: "app",
  private: true,
  scripts: { test: "true", typecheck: "tsc --noEmit" },
})}\n`;

/** SPEC proposed under contract, with `verify` as the verification of its tasks. */
async function proposed(verify: string): Promise<string> {
  const root = await tempRepo({
    ...APP,
    "package.json": PACKAGE,
    ".specty/config.yaml": `${CONFIG(verify)}policy:\n  tests: contract\n`,
  });
  await cli(root, ["new", "Saludo personalizado"]);
  await writeFiles(root, { [SPEC_PATH]: SPEC });
  const out = await cli(root, ["propose"]);
  expect(out.code, out.out).toBe(0);
  return out.out;
}

describe("the type check at propose, under contract", () => {
  it("AC3: warns that the last code task does not run the project's type check", async () => {
    const out = await proposed("npm test");
    expect(out).toContain("AVISOS:");
    expect(out).toContain("T2 es la última tarea de código");
    expect(out).toContain("`npm run typecheck`");
  });

  it("AC3: does not warn once the verification of its last code task runs it", async () => {
    const out = await proposed("npm test && npm run typecheck");
    expect(out).not.toContain("última tarea de código");
  });
});
