// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { detectProject } from "../src/detect/project";
import { dartWorkspace } from "../src/detect/units-dart";
import { DETECTORS, proposedUnits } from "../src/detect/workspace-units";
import { cli, tempRepo } from "./support";

const TITLE = "UNIDADES DE VERIFICACIÓN PROPUESTAS";

/** A package's test, so its folder has `test`. */
const TEST = "import 'package:test/test.dart';\n\nvoid main() {}\n";

/** A package's `pubspec.yaml`: its `name`, `resolution: workspace` and the lines of `dependencies`. */
const pubspec = (name: string, dependencies: readonly string[] = []) =>
  [
    `name: ${name}`,
    "resolution: workspace",
    "environment:",
    "  sdk: ^3.6.0",
    ...(dependencies.length > 0 ? ["dependencies:"] : []),
    ...dependencies.map((line) => `  ${line}`),
    "",
  ].join("\n");

/** A pub workspace root: its `pubspec.yaml` with the folders of `workspace`. */
const workspace = (members: readonly string[]) =>
  [
    "name: demo_workspace",
    "publish_to: none",
    "environment:",
    "  sdk: ^3.6.0",
    "workspace:",
    ...members.map((member) => `  - ${member}`),
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

describe("specty init in a Dart workspace", () => {
  it("AC6: proposes one unit per package with tests of a pub workspace, with dart or flutter test in its folder and the folders of the packages it depends on", async () => {
    const dir = await tempRepo({
      "pubspec.yaml": workspace([
        "packages/core",
        "packages/models",
        "packages/api",
        "apps/mobile",
      ]),
      "pubspec.lock": "packages: {}\n",
      "packages/core/pubspec.yaml": pubspec("core"),
      "packages/core/test/core_test.dart": TEST,
      "packages/models/pubspec.yaml": pubspec("models"),
      "packages/api/pubspec.yaml": pubspec("api", ["core: any", "models: any", "http: ^1.2.0"]),
      "packages/api/test/api_test.dart": TEST,
      "apps/mobile/pubspec.yaml": pubspec("mobile", ["flutter:", "  sdk: flutter", "api: any"]),
      "apps/mobile/test/widget_test.dart": TEST,
    });
    const result = await cli(dir, ["init", "--language", "es"]);
    expect(result.code).toBe(0);
    expect(result.out).toContain(`${TITLE}:`);
    const shared = ["pubspec.yaml", "pubspec.lock"];
    expect(proposed(result.out)).toEqual([
      { name: "estático", command: "dart analyze", paths: ["**"] },
      {
        name: "core",
        command: "(cd packages/core && dart test)",
        paths: ["packages/core/**", ...shared],
      },
      {
        name: "api",
        command: "(cd packages/api && dart test)",
        paths: ["packages/api/**", "packages/core/**", "packages/models/**", ...shared],
      },
      {
        name: "mobile",
        command: "(cd apps/mobile && flutter test)",
        paths: [
          "apps/mobile/**",
          "packages/api/**",
          "packages/core/**",
          "packages/models/**",
          ...shared,
        ],
      },
    ]);
  });

  it("AC6: reads a melos workspace without its ignored folders, the root or the ones without a named pubspec.yaml, and counts dev_dependencies", async () => {
    const lines = await unitsFor({
      "pubspec.yaml": "name: demo_root\npublish_to: none\ndev_dependencies:\n  melos: ^6.3.0\n",
      "melos.yaml":
        "name: demo\npackages:\n  - .\n  - packages/**\nignore:\n  - packages/legacy*\n",
      "packages/a/pubspec.yaml": "name: a\n",
      "packages/a/test/a_test.dart": TEST,
      "packages/b/pubspec.yaml":
        "name: b\ndev_dependencies:\n  a:\n    path: ../a\n  test: ^1.25.0\n",
      "packages/b/test/b_test.dart": TEST,
      "packages/c/pubspec.yaml":
        "name: c\ndependencies:\n  b: ^1.0.0\n  demo_root: any\nflutter:\n  uses-material-design: true\n",
      "packages/c/test/c_test.dart": TEST,
      "packages/legacy_x/pubspec.yaml": "name: legacy_x\ndependencies:\n  a: any\n",
      "packages/legacy_x/test/x_test.dart": TEST,
      "packages/broken/pubspec.yaml": "name: [\n",
      "packages/broken/test/broken_test.dart": TEST,
      "packages/nameless/pubspec.yaml": "version: 1.0.0\n",
      "packages/nameless/test/nameless_test.dart": TEST,
      "packages/notes/README.md": "# notes\n",
    });
    const shared = ["pubspec.yaml", "melos.yaml"];
    expect(unitsOf(lines)).toEqual([
      { name: "static", command: "dart analyze", paths: ["**"] },
      { name: "a", command: "(cd packages/a && dart test)", paths: ["packages/a/**", ...shared] },
      {
        name: "b",
        command: "(cd packages/b && dart test)",
        paths: ["packages/b/**", "packages/a/**", ...shared],
      },
      {
        name: "c",
        command: "(cd packages/c && flutter test)",
        paths: ["packages/c/**", "packages/a/**", "packages/b/**", ...shared],
      },
    ]);
  });

  it("AC6: proposes nothing with fewer than two packages with tests or without a workspace", async () => {
    const single = await tempRepo({
      "pubspec.yaml": workspace(["packages/core"]),
      "packages/core/pubspec.yaml": pubspec("core"),
      "packages/core/test/core_test.dart": TEST,
    });
    expect(await dartWorkspace(single)).toBeUndefined();
    const untested = await unitsFor({
      "pubspec.yaml": workspace(["packages/*"]),
      "packages/core/pubspec.yaml": pubspec("core"),
      "packages/core/test/core_test.dart": TEST,
      "packages/docs/pubspec.yaml": pubspec("docs"),
    });
    expect(untested).toBeUndefined();
    const plain = await unitsFor({
      "pubspec.yaml": pubspec("demo"),
      "test/demo_test.dart": TEST,
    });
    expect(plain).toBeUndefined();
  });

  it("AC6: the Dart detector goes after the other workspaces' detectors", () => {
    expect(DETECTORS.at(-1)).toBe(dartWorkspace);
  });
});

describe("specty init in a Dart workspace whose root has tests", () => {
  it("AC3: proposes the root's unit with dart test in the root, named as its package, with the root outside the packages' folders", async () => {
    const units = unitsOf(
      await unitsFor({
        "pubspec.yaml": workspace(["packages/*"]),
        "lib/demo.dart": "void main() {}\n",
        "test/workspace_test.dart": TEST,
        "README.md": "# demo\n",
        ".github/workflows/ci.yml": "on: push\n",
        "packages/core/pubspec.yaml": pubspec("core"),
        "packages/core/test/core_test.dart": TEST,
        "packages/api/pubspec.yaml": pubspec("api", ["core: any"]),
        "packages/api/test/api_test.dart": TEST,
      }),
    );
    expect(units).toEqual([
      { name: "static", command: "dart analyze", paths: ["**"] },
      {
        name: "demo_workspace",
        command: "dart test",
        paths: ["README.md", "lib/**", "pubspec.yaml", "test/**"],
      },
      {
        name: "core",
        command: "(cd packages/core && dart test)",
        paths: ["packages/core/**", "pubspec.yaml"],
      },
      {
        name: "api",
        command: "(cd packages/api && dart test)",
        paths: ["packages/api/**", "packages/core/**", "pubspec.yaml"],
      },
    ]);
  });
});
