// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { CONFIG, cli, tempRepo, writeFiles } from "./support";

/** Small limits, so that the functions stay short; `secrets` and the project's tests stay off. */
const CHECKS =
  "checks:\n  levels: { secrets: off, tests: off }\n  functions: { maxLines: 5, complexity: 3 }\n";

const text = (lines: readonly string[]) => `${lines.join("\n")}\n`;

async function mix(files: Readonly<Record<string, string>>): Promise<string> {
  return tempRepo({
    "mix.exs": "defmodule App.MixProject do\nend\n",
    ".specty/config.yaml": `${CONFIG()}${CHECKS}`,
    ...files,
  });
}

/** A module whose `def total` has `body + 3` lines of code. */
function orders(body: number): string {
  const steps = Array.from({ length: body }, (_, index) => `    IO.puts(${index})`);
  return text(["defmodule Orders do", "  def total(x) do", ...steps, "    x", "  end", "end"]);
}

describe("the function checks of specty check, in Elixir", () => {
  it("AC1: fail on a `def` that grows past the limit in a Mix project", async () => {
    const root = await mix({ "lib/orders.ex": orders(1) });
    await writeFiles(root, { "lib/orders.ex": orders(5) });
    const run = await cli(root, ["check"]);
    expect(run.code).toBe(1);
    expect(run.out).toContain("  lib/orders.ex:2 `total` tiene 8 líneas de código (máximo 5)");
  });

  it("AC2: fail on a `defp` whose `case` has more clauses than the complexity allows", async () => {
    const root = await mix({});
    await writeFiles(root, {
      "lib/kinds.ex": text([
        "defmodule Kinds do",
        "  defp kind(x) do",
        "    case x do",
        "      0 -> :zero",
        "      1 -> :one",
        "      2 -> :two",
        "      _ -> :many",
        "    end",
        "  end",
        "end",
      ]),
    });
    const run = await cli(root, ["check"]);
    expect(run.code).toBe(1);
    expect(run.out).toContain("  lib/kinds.ex:2 `kind` tiene complejidad 5 (máximo 3)");
  });
});
