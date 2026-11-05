// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { detectProject } from "../src/detect/project";
import { proposedUnits } from "../src/detect/workspace-units";
import { cli, tempRepo } from "./support";

const TITLE = "UNIDADES DE VERIFICACIÓN PROPUESTAS";

/** A module's `go.mod`, with a `require` block for `requires` when there are any. */
const goMod = (path: string, requires: readonly string[] = []) =>
  [
    `module ${path}`,
    "",
    "go 1.22",
    ...(requires.length > 0
      ? ["", "require (", ...requires.map((module) => `\t${module} v0.0.0`), ")"]
      : []),
    "",
  ].join("\n");

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null;

/** The units of YAML lines that go under `verify:`. */
function unitsOf(lines: readonly string[] | undefined): unknown {
  const doc: unknown = parse(`verify:\n${(lines ?? []).join("\n")}\n`);
  return isRecord(doc) && isRecord(doc.verify) ? doc.verify.units : undefined;
}

/** The units of the block in `init`'s card, without the block's indent. */
function proposed(out: string): unknown {
  const after = (out.split(`${TITLE}:\n`)[1] ?? "").split("\n");
  const end = after.findIndex((line) => !line.startsWith("  "));
  const lines = (end < 0 ? after : after.slice(0, end)).map((line) => line.slice(2));
  return unitsOf(lines.filter((line) => line === "  units:" || line.startsWith("    ")));
}

/** The units `init` would propose for a repository with `files`. */
async function unitsFor(files: Readonly<Record<string, string>>) {
  const root = await tempRepo(files);
  return proposedUnits(root, await detectProject(root, "demo"), "en");
}

describe("specty init in a go.work workspace", () => {
  it("AC1: proposes one unit per module with go test and the folders of the modules it requires", async () => {
    const root = await tempRepo({
      "go.work": 'go 1.22\n\nuse (\n\t./core\n\t./services/api // la API\n)\n\nuse "./cmd/cli"\n',
      "go.work.sum": "",
      "core/go.mod": goMod("example.com/demo/core"),
      "services/api/go.mod": goMod("example.com/demo/api", [
        "example.com/demo/core",
        "github.com/google/uuid",
      ]),
      "cmd/cli/go.mod":
        'module "example.com/demo/cli"\n\ngo 1.22\n\nrequire example.com/demo/api v0.0.0 // indirect\n',
    });
    const result = await cli(root, ["init", "--language", "es"]);
    expect(result.code).toBe(0);
    expect(result.out).toContain(`${TITLE}:`);
    const shared = ["go.work", "go.work.sum"];
    expect(proposed(result.out)).toEqual([
      { name: "core", command: "go test ./core/...", paths: ["core/**", ...shared] },
      {
        name: "api",
        command: "go test ./services/api/...",
        paths: ["services/api/**", "core/**", ...shared],
      },
      {
        name: "cli",
        command: "go test ./cmd/cli/...",
        paths: ["cmd/cli/**", "core/**", "services/api/**", ...shared],
      },
    ]);
  });

  it("AC1: leaves out the folders outside the repository and the ones without a go.mod", async () => {
    const lines = await unitsFor({
      "go.work": "go 1.22\n\nuse (\n\t./core\n\t./api/\n\t../shared\n\t/opt/tools\n\t./docs\n)\n",
      "core/go.mod": goMod("example.com/demo/core"),
      "api/go.mod": goMod("example.com/demo/api", ["example.com/demo/core"]),
      "docs/README.md": "# docs\n",
    });
    expect(unitsOf(lines)).toEqual([
      { name: "core", command: "go test ./core/...", paths: ["core/**", "go.work"] },
      { name: "api", command: "go test ./api/...", paths: ["api/**", "core/**", "go.work"] },
    ]);
  });

  it("AC1: proposes nothing with fewer than two modules or with the root module", async () => {
    const single = await unitsFor({
      "go.work": "go 1.22\n\nuse (\n\t./core\n\t./docs\n)\n",
      "core/go.mod": goMod("example.com/demo/core"),
      "docs/README.md": "# docs\n",
    });
    expect(single).toBeUndefined();
    const withRoot = await unitsFor({
      "go.work": "go 1.22\n\nuse (\n\t.\n\t./core\n\t./api\n)\n",
      "go.mod": goMod("example.com/demo"),
      "core/go.mod": goMod("example.com/demo/core"),
      "api/go.mod": goMod("example.com/demo/api", ["example.com/demo/core"]),
    });
    expect(withRoot).toBeUndefined();
  });
});
