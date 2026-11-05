// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { detectProject } from "../src/detect/project";
import { proposedUnits } from "../src/detect/workspace-units";
import { cli, tempRepo } from "./support";

const TITLE = "UNIDADES DE VERIFICACIÓN PROPUESTAS";

/** A member's `pyproject.toml`: its `[project]` with `name` and `dependencies`, then `extra`. */
const pyproject = (name: string, dependencies: readonly string[] = [], extra = "") =>
  [
    "[project]",
    `name = ${JSON.stringify(name)}`,
    'version = "0.1.0"',
    `dependencies = ${JSON.stringify(dependencies)}`,
    "",
    extra,
  ].join("\n");

/** A virtual workspace root: `[tool.uv.workspace]` with `members`, `exclude` and then `extra`. */
const root = (members: readonly string[], exclude: readonly string[] = [], extra = "") =>
  [
    "[tool.uv.workspace]",
    `members = ${JSON.stringify(members)}`,
    `exclude = ${JSON.stringify(exclude)}`,
    "",
    extra,
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
  const dir = await tempRepo(files);
  return proposedUnits(dir, await detectProject(dir, "demo"), "en");
}

describe("specty init in a uv workspace", () => {
  it("AC1: proposes one unit per member with tests, with uv run and the folders of the members it depends on", async () => {
    const dir = await tempRepo({
      "pyproject.toml": root(["packages/*", "apps/cli"], [], "[tool.ruff]\nline-length = 100\n"),
      "uv.lock": "version = 1\n",
      ".python-version": "3.12\n",
      "packages/core/pyproject.toml": pyproject("Demo_Core"),
      "packages/core/tests/test_core.py": "def test_core():\n    assert True\n",
      "packages/models/pyproject.toml": pyproject("demo.models"),
      "packages/api/pyproject.toml": pyproject("demo-api", [
        "demo-core>=1.0",
        "Demo-Models",
        "httpx",
      ]),
      "packages/api/tests/test_api.py": "def test_api():\n    assert True\n",
      "apps/cli/pyproject.toml": pyproject(
        "demo-cli",
        [],
        `[dependency-groups]\ndev = ["pytest>=8", "demo_api[extra]; python_version >= '3.12'"]\n`,
      ),
      "apps/cli/tests/test_cli.py": "def test_cli():\n    assert True\n",
    });
    const result = await cli(dir, ["init", "--language", "es"]);
    expect(result.code).toBe(0);
    expect(result.out).toContain(`${TITLE}:`);
    const shared = ["pyproject.toml", "uv.lock", ".python-version"];
    expect(proposed(result.out)).toEqual([
      { name: "estático", command: "uv run ruff check", paths: ["**"] },
      {
        name: "core",
        command: "uv run --package Demo_Core pytest packages/core",
        paths: ["packages/core/**", ...shared],
      },
      {
        name: "api",
        command: "uv run --package demo-api pytest packages/api",
        paths: ["packages/api/**", "packages/core/**", "packages/models/**", ...shared],
      },
      {
        name: "cli",
        command: "uv run --package demo-cli pytest apps/cli",
        paths: [
          "apps/cli/**",
          "packages/api/**",
          "packages/core/**",
          "packages/models/**",
          ...shared,
        ],
      },
    ]);
  });

  it("AC1: leaves out the excluded folders and the ones without a named pyproject.toml, and reads every dependency list", async () => {
    const test = "def test_it():\n    assert True\n";
    const lines = await unitsFor({
      "pyproject.toml": root(["libs/*"], ["libs/old*"]),
      "conftest.py": "",
      "pytest.ini": "[pytest]\n",
      "libs/a/pyproject.toml": pyproject("a"),
      "libs/a/tests/test_a.py": test,
      "libs/b/pyproject.toml": pyproject("b", [], '[project.optional-dependencies]\ncli = ["a"]\n'),
      "libs/b/tests/test_b.py": test,
      "libs/c/pyproject.toml": pyproject("c", [], '[tool.uv]\ndev-dependencies = ["B"]\n'),
      "libs/c/tests/test_c.py": test,
      "libs/old-x/pyproject.toml": pyproject("old-x", ["a"]),
      "libs/old-x/tests/test_old.py": test,
      "libs/broken/pyproject.toml": "[project\nname = ",
      "libs/broken/tests/test_broken.py": test,
      "libs/nameless/pyproject.toml": '[project]\nversion = "0.1.0"\n',
      "libs/nameless/tests/test_nameless.py": test,
      "libs/notes/README.md": "# notes\n",
    });
    const shared = ["pyproject.toml", "pytest.ini", "conftest.py"];
    expect(unitsOf(lines)).toEqual([
      { name: "a", command: "uv run --package a pytest libs/a", paths: ["libs/a/**", ...shared] },
      {
        name: "b",
        command: "uv run --package b pytest libs/b",
        paths: ["libs/b/**", "libs/a/**", ...shared],
      },
      {
        name: "c",
        command: "uv run --package c pytest libs/c",
        paths: ["libs/c/**", "libs/a/**", "libs/b/**", ...shared],
      },
    ]);
  });

  it("AC1: proposes nothing with fewer than two members with tests, with a project in the root or without a uv workspace", async () => {
    const single = await unitsFor({
      "pyproject.toml": root(["packages/*"]),
      "packages/core/pyproject.toml": pyproject("core"),
      "packages/core/tests/test_core.py": "def test_core():\n    assert True\n",
      "packages/docs/pyproject.toml": pyproject("docs"),
    });
    expect(single).toBeUndefined();
    const withRoot = await unitsFor({
      "pyproject.toml": `${pyproject("demo", ["core", "api"])}\n${root(["packages/*"])}`,
      "tests/test_demo.py": "def test_demo():\n    assert True\n",
      "packages/core/pyproject.toml": pyproject("core"),
      "packages/core/tests/test_core.py": "def test_core():\n    assert True\n",
      "packages/api/pyproject.toml": pyproject("api", ["core"]),
      "packages/api/tests/test_api.py": "def test_api():\n    assert True\n",
    });
    expect(withRoot).toBeUndefined();
    const plain = await unitsFor({
      "pyproject.toml": pyproject("demo"),
      "tests/test_demo.py": "def test_demo():\n    assert True\n",
    });
    expect(plain).toBeUndefined();
  });
});
