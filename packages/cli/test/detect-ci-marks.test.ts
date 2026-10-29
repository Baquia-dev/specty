// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { detectProject, projectFacts } from "../src/detect/project";
import { tempRepo } from "./support";

/** A GitHub Actions workflow whose only job runs `commands`, one step each. */
const workflow = (...commands: readonly string[]) =>
  [
    "jobs:",
    "  checks:",
    "    steps:",
    ...commands.map((command) => `      - run: ${command}`),
    "",
  ].join("\n");

describe("the commands detection takes from the CI", () => {
  it("say so in their label, and the stack's do not", async () => {
    const root = await tempRepo({
      "go.mod": "module example.com/app\n\ngo 1.22\n",
      ".github/workflows/ci.yml": workflow("go test -race ./...", "make typecheck"),
    });
    expect(projectFacts(await detectProject(root, "app")).commands).toEqual([
      { label: "Tests", command: "go test ./..." },
      { label: "Lint", command: "go vet ./..." },
      { label: "Typecheck (CI)", command: "make typecheck" },
    ]);
  });

  it("leave out a command with a pipe, which hides its exit code", async () => {
    const root = await tempRepo({
      Makefile: "all:\n",
      ".github/workflows/ci.yml": workflow(
        "make test || true",
        "make lint | tee lint.log",
        "make typecheck",
      ),
    });
    expect((await detectProject(root, "app")).commands).toEqual({ typecheck: "make typecheck" });
  });
});
