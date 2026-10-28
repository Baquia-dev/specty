// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { detectProject, verifyCommands } from "../src/detect/project";
import { tempRepo } from "./support";

/** The commands detection finds in a repository with `files`. */
async function commandsIn(files: Readonly<Record<string, string>>) {
  return (await detectProject(await tempRepo(files), "app")).commands;
}

const WORKFLOW = [
  "name: ci",
  "on: push",
  "jobs:",
  "  checks:",
  "    runs-on: ubuntu-latest",
  "    steps:",
  "      - uses: actions/checkout@v4",
  "      - run: ./setup.sh",
  "      - name: Lint",
  "        run: make lint",
  "      - name: Tests",
  "        run: |",
  "          echo starting",
  "          make test",
  "",
].join("\n");

describe("the commands of the project's CI", () => {
  it("AC1: a project with no stack Specty knows takes its tests and lint from GitHub Actions", async () => {
    const commands = await commandsIn({
      Makefile: "test:\n\t./run-tests\n",
      ".github/workflows/ci.yml": WORKFLOW,
    });
    expect(commands).toEqual({ test: "make test", lint: "make lint" });
    expect(verifyCommands(commands)).toEqual({
      default: "make test",
      full: "make lint && make test",
    });
  });

  it("AC2: the stack's commands stay, and the CI only fills the missing ones", async () => {
    const commands = await commandsIn({
      "go.mod": "module example.com/app\n\ngo 1.22\n",
      ".github/workflows/ci.yml": [
        "jobs:",
        "  go:",
        "    steps:",
        "      - run: go test -race ./...",
        "      - run: make type-check",
        "",
      ].join("\n"),
    });
    expect(commands).toEqual({
      test: "go test ./...",
      lint: "go vet ./...",
      typecheck: "make type-check",
    });
  });

  it("AC3: GitLab, CircleCI, Bitbucket and Azure count like GitHub's run", async () => {
    const cases: readonly (readonly [string, string, Record<string, string>])[] = [
      [
        ".gitlab-ci.yml",
        "stages: [test]\nunit:\n  stage: test\n  script:\n    - make test\n",
        { test: "make test" },
      ],
      [
        ".circleci/config.yml",
        "version: 2.1\njobs:\n  build:\n    steps:\n      - checkout\n      - run:\n          name: Lint\n          command: make lint\n",
        { lint: "make lint" },
      ],
      [
        "bitbucket-pipelines.yml",
        "pipelines:\n  default:\n    - step:\n        script:\n          - make test\n",
        { test: "make test" },
      ],
      ["azure-pipelines.yml", "steps:\n  - script: make lint\n", { lint: "make lint" }],
    ];
    for (const [file, text, expected] of cases) {
      expect(await commandsIn({ Makefile: "all:\n", [file]: text }), file).toEqual(expected);
    }
  });

  it("AC4: variables, expressions, installs, comments and continued lines do not count", async () => {
    const commands = await commandsIn({
      Makefile: "all:\n",
      ".github/workflows/ci.yml": [
        "jobs:",
        "  checks:",
        "    steps:",
        "      - run: pip install pytest",
        // A GitHub expression, built from parts so it is not read as a template placeholder.
        "      - run: npm test -- --shard=$" + "{{ matrix.shard }}",
        "      - run: make test TARGET=$TARGET",
        "      - run: |",
        "          # make test",
        "          make lint \\",
        "            --strict",
        "      - run: echo done && make typecheck",
        "",
      ].join("\n"),
    });
    expect(commands).toEqual({ typecheck: "make typecheck" });
  });
});
