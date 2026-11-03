// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { CONFIG, cli, tempRepo, writeFiles } from "./support";

/** Small limits, so that the functions of the tests stay short; `secrets` stays off. */
const CHECKS = "checks:\n  levels: { secrets: off }\n  functions: { maxLines: 5, complexity: 3 }\n";

/**
 * A function with a parameter named `record`, of `body + 3` lines of code. The line estimator
 * takes `record` for a Java type declaration and does not see the function at all.
 */
const derive = (body: number, value = 1) =>
  [
    "export function deriveView(record: Row): string {",
    "  let text = record.id;",
    ...Array.from({ length: body - 1 }, () => `  text += "${value}";`),
    "  return text;",
    "}",
  ].join("\n");

/** A function without a parameter the estimator stumbles on, of `body + 3` lines of code. */
const fresh = (body: number) =>
  [
    "export function fresh(x: number): number {",
    ...Array.from({ length: body }, (_, index) => `  x += ${index};`),
    "  return x;",
    "}",
  ].join("\n");

const ROW = "interface Row {\n  id: string;\n}";

async function repo(files: Readonly<Record<string, string>>): Promise<string> {
  return tempRepo({
    "package.json": `${JSON.stringify({ name: "app" })}\n`,
    ".specty/config.yaml": `${CONFIG()}${CHECKS}`,
    ...files,
  });
}

describe("the function checks of specty check, on the syntax tree", () => {
  it("AC1: fail on a TypeScript function with a parameter named `record` that grows past the limit", async () => {
    const root = await repo({ "src/view.ts": `${ROW}\n\n${derive(1)}\n` });
    await writeFiles(root, { "src/view.ts": `${ROW}\n\n${derive(5)}\n` });
    const run = await cli(root, ["check"]);
    expect(run.code).toBe(1);
    expect(run.out).toContain(
      "FALLA function-lines\n  src/view.ts:5 `deriveView` tiene 8 líneas de código (máximo 5)",
    );
  });

  it("AC2: fail on an arrow function whose body is an expression of several lines", async () => {
    const root = await repo({});
    await writeFiles(root, {
      "src/badge.jsx": [
        "export const Badge = ({ on, label, count }) =>",
        "  on && label ? (",
        "    <span>{count > 0 ? count : label}</span>",
        "  ) : null;",
        "",
      ].join("\n"),
    });
    const run = await cli(root, ["check"]);
    expect(run.code).toBe(1);
    expect(run.out).toContain(
      "FALLA complexity\n  src/badge.jsx:1 `Badge` tiene complejidad 4 (máximo 3)",
    );
  });

  it("AC5: measure both versions alike when the starting one has a syntax error", async () => {
    // `deriveView` was already past the limit. If the starting version were measured by the
    // estimator, which does not see it, and the new one on the tree, it would look new.
    const root = await repo({
      "src/view.ts": `${ROW}\n\n${derive(5, 1)}\n\nexport const broken = (;\n`,
    });
    await writeFiles(root, {
      "src/view.ts": `${ROW}\n\n${derive(5, 2)}\n\n${fresh(4)}\n`,
    });
    const run = await cli(root, ["check"]);
    expect(run.out).toContain("`fresh` tiene 7 líneas de código (máximo 5)");
    expect(run.out).not.toContain("deriveView");
  });
});
