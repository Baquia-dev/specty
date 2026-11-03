// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { CONFIG, cli, tempRepo, writeFiles } from "./support";

/** Small limits, so that the functions of the tests stay short; `secrets` stays off. */
const CHECKS = "checks:\n  levels: { secrets: off }\n  functions: { maxLines: 5, complexity: 3 }\n";

/**
 * A Kotlin function with a parameter named `record`, of `body + 3` lines of code: the line
 * estimator takes `record` for a Java type declaration and does not see it.
 */
function run(body: number): string {
  const steps = Array.from({ length: body }, () => "  println(record)");
  return `${["fun run(record: Int): Int {", ...steps, "  return record", "}"].join("\n")}\n`;
}

describe("the function checks of specty check, in Kotlin", () => {
  it("AC1: fail on a function with a parameter named `record` that grows past the limit", async () => {
    const root = await tempRepo({
      "package.json": `${JSON.stringify({ name: "app" })}\n`,
      ".specty/config.yaml": `${CONFIG()}${CHECKS}`,
      "src/main/kotlin/Run.kt": run(1),
    });
    await writeFiles(root, { "src/main/kotlin/Run.kt": run(5) });
    const result = await cli(root, ["check"]);
    expect(result.code).toBe(1);
    expect(result.out).toContain(
      "  src/main/kotlin/Run.kt:1 `run` tiene 8 líneas de código (máximo 5)",
    );
  });
});
